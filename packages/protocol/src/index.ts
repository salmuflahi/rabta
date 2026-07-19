import { z } from "zod";

/** Wire protocol version. Bump only with a spec change. */
export const PROTOCOL_VERSION = 1;

export const ConnectorKind = z.enum(["fake", "vscode", "chrome"]);
export type ConnectorKind = z.infer<typeof ConnectorKind>;

export const HelloPayload = z.object({
  name: z.string().min(1),
  kind: ConnectorKind,
  protocolVersion: z.number().int(),
  capabilities: z.array(z.string()),
  secret: z.string().min(1).optional(),
  token: z.string().min(1).optional(),
});

export const WelcomePayload = z.object({ connectorId: z.string().min(1) });

export const CommandPayload = z.object({
  target: z.string().min(1),
  name: z.string().min(1),
  args: z.unknown(),
});

export const ResponsePayload = z.object({
  requestId: z.string().min(1),
  ok: z.boolean(),
  result: z.unknown().optional(),
  error: z.string().optional(),
});

export const EventPayload = z.object({ name: z.string().min(1), data: z.unknown() });

export const ErrorPayload = z.object({ code: z.string().min(1), message: z.string() });

export const PairPayload = z.object({ name: z.string().min(1), kind: ConnectorKind });

export const PairedPayload = z.object({ token: z.string().min(1) });

export const EmptyPayload = z.object({});

const base = { v: z.literal(PROTOCOL_VERSION), id: z.string().min(1) };

/** Every frame on the wire is one of these envelopes. */
export const Envelope = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("hello"), payload: HelloPayload }),
  z.object({ ...base, kind: z.literal("welcome"), payload: WelcomePayload }),
  z.object({ ...base, kind: z.literal("command"), payload: CommandPayload }),
  z.object({ ...base, kind: z.literal("response"), payload: ResponsePayload }),
  z.object({ ...base, kind: z.literal("event"), payload: EventPayload }),
  z.object({ ...base, kind: z.literal("error"), payload: ErrorPayload }),
  z.object({ ...base, kind: z.literal("pair"), payload: PairPayload }),
  z.object({ ...base, kind: z.literal("paired"), payload: PairedPayload }),
  z.object({ ...base, kind: z.literal("ping"), payload: EmptyPayload }),
  z.object({ ...base, kind: z.literal("pong"), payload: EmptyPayload }),
]);
export type Envelope = z.infer<typeof Envelope>;
