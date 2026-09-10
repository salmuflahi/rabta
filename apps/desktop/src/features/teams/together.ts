import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, type RefObject } from "react";
import { useStore } from "@/store";
import { sendCursor, type TeamConnection, type TeamCursor, type TeamMember } from "./client";
import { personColor } from "./thread";

export interface TogetherOptions {
  connection: TeamConnection | null;
  me: string | null;
  members: TeamMember[];
  cursors: Record<string, TeamCursor>;
  /** The thread the person is in, reported with every update. */
  task: string | null;
  /** Where this Mac keeps the shared project; needed to draw teammates in the editor. */
  projectRoot: string | null;
  stageRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  leading: boolean;
  following: string | null;
  onError?: (message: string) => void;
}
type HubEvent = { type: string; connectorId?: string; name?: string; data?: Record<string, unknown> };
const isEditor = (value: unknown): value is NonNullable<TeamCursor["editor"]> => !!value && typeof value === "object" && typeof (value as { path?: unknown }).path === "string";

/**
 * Together: while on, this person's pointer over the Room and their editor
 * cursor (reported by the VS Code connector) go to the room at most ten times
 * a second; teammates' editor cursors are drawn in the editor, and Follow
 * reveals the leader's file and line. Off means zero cursor traffic.
 */
export function useTogether({ connection, me, members, cursors, task, projectRoot, stageRef, enabled, leading, following, onError }: TogetherOptions) {
  const vscode = useStore(s => s.connectors.find(c => c.kind === "vscode" && c.connected)?.id ?? null);
  const latest = useRef({ task, leading, following, enabled, connection });
  latest.current = { task, leading, following, enabled, connection };
  const lastEditor = useRef<TeamCursor["editor"]>(null);
  const shown = useRef("");
  const revealed = useRef("");
  const wasOn = useRef(false);

  // Pointer over the Room and heartbeat.
  useEffect(() => {
    const stage = stageRef.current;
    if (!enabled || !connection || !stage) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending: { x: number; y: number } | null = null;
    let lastPointer: { x: number; y: number } | null = null;
    const controller = new AbortController();
    const flush = () => {
      timer = undefined;
      const pointer = pending; pending = null;
      if (!pointer) return;
      lastPointer = pointer;
      void sendCursor(connection, { active: true, task: latest.current.task, pointer, leading: latest.current.leading, following: latest.current.following }, controller.signal).catch(error => onError?.(String(error instanceof Error ? error.message : error)));
    };
    const move = (event: MouseEvent) => {
      const rect = stage.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      pending = { x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)), y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)) };
      if (!timer) timer = setTimeout(flush, 100);
    };
    const leave = () => { pending = null; };
    stage.addEventListener("mousemove", move);
    stage.addEventListener("mouseleave", leave);
    // Announce presence in the thread even before the pointer moves, then keep the cursor alive.
    void sendCursor(connection, { active: true, task, leading, following, pointer: null }, controller.signal).catch(() => {});
    const heartbeat = setInterval(() => {
      void sendCursor(connection, { active: true, task: latest.current.task, pointer: lastPointer, editor: lastEditor.current, leading: latest.current.leading, following: latest.current.following }, controller.signal).catch(() => {});
    }, 20_000);
    return () => {
      stage.removeEventListener("mousemove", move);
      stage.removeEventListener("mouseleave", leave);
      clearInterval(heartbeat);
      if (timer) clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, connection, stageRef, task, leading, following, onError]);

  // Leaving Together tells the room and the editor at once.
  useEffect(() => {
    if (!connection) return;
    if (!enabled) {
      // Only a person who was sharing has anything to withdraw; off stays silent.
      if (!wasOn.current) return;
      wasOn.current = false;
      void sendCursor(connection, { active: false }).catch(() => {});
      lastEditor.current = null; shown.current = ""; revealed.current = "";
      if (vscode) {
        void invoke("send_command", { target: vscode, name: "together.configure", args: { enabled: false } }).catch(() => {});
        void invoke("send_command", { target: vscode, name: "editor.showCursors", args: { cursors: [] } }).catch(() => {});
      }
      return;
    }
    wasOn.current = true;
    if (vscode) void invoke("send_command", { target: vscode, name: "together.configure", args: { enabled: true } }).catch(error => onError?.(`The editor could not start sharing its cursor: ${error}`));
    return () => { if (vscode) void invoke("send_command", { target: vscode, name: "together.configure", args: { enabled: false } }).catch(() => {}); };
  }, [enabled, connection, vscode, onError]);

  // Editor cursor events from the connector, forwarded project-relative.
  useEffect(() => {
    if (!enabled || !connection) return;
    let unlisten: (() => void) | undefined; let cancelled = false;
    void listen<HubEvent>("hub-event", event => {
      const payload = event.payload;
      if (payload.type !== "eventReceived" || payload.name !== "editor.cursor") return;
      const data = payload.data ?? {};
      const editor = isEditor(data) ? { path: data.path, line: Number(data.line) || 1, column: Number(data.column) || 1, ...(isEditor(data.selection) || (data.selection && typeof data.selection === "object") ? { selection: { line: Number((data.selection as { line?: unknown }).line) || 1, column: Number((data.selection as { column?: unknown }).column) || 1 } } : {}) } : null;
      lastEditor.current = editor;
      void sendCursor(connection, { active: true, task: latest.current.task, editor, leading: latest.current.leading, following: latest.current.following }).catch(() => {});
    }).then(stop => { if (cancelled) stop(); else unlisten = stop; });
    return () => { cancelled = true; unlisten?.(); };
  }, [enabled, connection]);

  // Teammates in the editor: draw their cursors, follow the leader.
  useEffect(() => {
    if (!enabled || !vscode || !projectRoot) return;
    const peers = Object.values(cursors).filter(cursor => cursor.memberId !== me && cursor.editor && (!task || !cursor.task || cursor.task === task)).map(cursor => ({
      id: cursor.memberId,
      name: members.find(member => member.id === cursor.memberId)?.displayName ?? "Teammate",
      color: personColor(cursor.memberId, members),
      path: `${projectRoot.replace(/\/+$/, "")}/${cursor.editor!.path}`,
      line: cursor.editor!.line,
      column: cursor.editor!.column,
    }));
    const key = JSON.stringify(peers);
    if (key !== shown.current) {
      shown.current = key;
      void invoke("send_command", { target: vscode, name: "editor.showCursors", args: { cursors: peers } }).catch(() => {});
    }
    const leader = following ? peers.find(peer => peer.id === following) : undefined;
    if (leader) {
      const where = `${leader.path}:${leader.line}`;
      if (where !== revealed.current) {
        revealed.current = where;
        const timer = setTimeout(() => { void invoke("send_command", { target: vscode, name: "editor.reveal", args: { path: leader.path, line: leader.line, column: leader.column } }).catch(error => onError?.(`Could not follow into the editor: ${error}`)); }, 250);
        return () => clearTimeout(timer);
      }
    }
  }, [enabled, vscode, projectRoot, cursors, me, members, task, following, onError]);

  return { editorConnected: !!vscode };
}
