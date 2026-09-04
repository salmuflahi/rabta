// Shared test plumbing: a typed incoming request, a way to call the worker as
// the runtime would, and a clean database between tests.

import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import worker from "../src/index";

export const ORIGIN = "https://count.rabta.build";
export const TABLES = ["days", "hits", "refs", "geo", "devices", "salts", "uniques"] as const;

export type IncomingRequest = Request<unknown, IncomingRequestCfProperties>;
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

/** A request as the edge would hand it over, with an optional `cf` object. */
export function incoming(
  path: string,
  init: RequestInit<IncomingRequestCfProperties> = {},
  cf?: Partial<IncomingRequestCfProperties>,
): IncomingRequest {
  return new IncomingRequest(`${ORIGIN}${path}`, { ...init, cf: cf as IncomingRequestCfProperties | undefined });
}

/** Runs the worker's fetch handler and waits for anything it deferred. */
export async function call(request: IncomingRequest, e: Cloudflare.Env = env): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await worker.fetch(request, e, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

/** A page-view beacon. Defaults to one fixed visitor; override headers to be someone else. */
export function hit(body: unknown, headers: Record<string, string> = {}, cf?: Partial<IncomingRequestCfProperties>): Promise<Response> {
  return call(
    incoming(
      "/hit",
      {
        method: "POST",
        headers: {
          "content-type": "text/plain",
          "cf-connecting-ip": "203.0.113.7",
          "user-agent": "Mozilla/5.0 (test) Rabta/1.0",
          ...headers,
        },
        body: typeof body === "string" ? body : JSON.stringify(body),
      },
      cf,
    ),
  );
}

export async function wipe(): Promise<void> {
  await env.DB.batch(TABLES.map((t) => env.DB.prepare(`DELETE FROM ${t}`)));
}

export async function count(table: (typeof TABLES)[number]): Promise<number> {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>();
  return row?.n ?? 0;
}

export async function rows<T = Record<string, unknown>>(sql: string, ...binds: unknown[]): Promise<T[]> {
  const result = await env.DB.prepare(sql).bind(...binds).all<T>();
  return result.results;
}
