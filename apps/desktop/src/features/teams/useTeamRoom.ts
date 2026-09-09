import { useCallback, useEffect, useRef, useState } from "react";
import { roomPath, teamRequest, TeamRequestError, watchTeam, type TeamConnection, type TeamState } from "./client";

// Deliberately process-memory only: navigation retains the connection, quitting does not.
let rememberedConnection: TeamConnection | null = null;
export function clearRememberedTeamConnection() { rememberedConnection = null; }

export function useTeamRoom() {
  const [connection, setConnection] = useState<TeamConnection | null>(rememberedConnection);
  const [state, setState] = useState<TeamState | null>(null);
  const [connectionState, setConnectionState] = useState<"connecting" | "live" | "offline" | "expired">("connecting");
  const [connectionError, setConnectionError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const acceptState = useCallback((next: TeamState) => {
    setState(previous => !previous || previous.room.id !== next.room.id || next.revision >= previous.revision ? next : previous);
  }, []);
  const refresh = useCallback(async () => {
    if (!connection) return;
    const started = generation.current;
    const next = await teamRequest<TeamState>(connection.endpoint, roomPath(connection, "/state"), connection.memberKey);
    if (started === generation.current) acceptState(next);
    return next;
  }, [connection, acceptState]);

  useEffect(() => {
    generation.current++;
    if (!connection) return;
    const controller = new AbortController();
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let refreshing = false;
    let queued = false;
    let streamReady = false;
    const report = (error: unknown) => {
      if (controller.signal.aborted) return;
      setConnectionState(error instanceof TeamRequestError && [401, 403].includes(error.status) ? "expired" : "offline");
      setConnectionError(error instanceof Error ? error.message : "The workspace is unavailable. Reconnect to try again.");
    };
    const read = async () => {
      if (refreshing) { queued = true; return; }
      refreshing = true;
      try {
        do {
          queued = false;
          const next = await teamRequest<TeamState>(connection.endpoint, roomPath(connection, "/state"), connection.memberKey, { signal: controller.signal });
          if (!controller.signal.aborted) {
            acceptState(next);
            setConnectionState(streamReady ? "live" : "connecting");
            setConnectionError("");
          }
        } while (queued && !controller.signal.aborted);
      } catch (error) { report(error); }
      finally { refreshing = false; }
    };
    const start = async (retries = 0) => {
      setConnectionState("connecting");
      streamReady = false;
      await read();
      if (controller.signal.aborted) return;
      try {
        await watchTeam(connection, controller.signal, () => {
          streamReady = true;
          void read();
        });
      } catch (error) {
        streamReady = false;
        report(error);
        if (!controller.signal.aborted && retries < 3 && !(error instanceof TeamRequestError && [401, 403].includes(error.status)))
          retryTimer = setTimeout(() => void start(retries + 1), 1000 * 2 ** retries);
      }
    };
    void start();
    return () => { generation.current++; controller.abort(); clearTimeout(retryTimer); };
  }, [connection, attempt, acceptState]);

  function connect(next: TeamConnection) {
    rememberedConnection = next;
    setState(null);
    setConnection(next);
    setConnectionError("");
  }
  function disconnect() {
    rememberedConnection = null;
    generation.current++;
    setConnection(null);
    setState(null);
  }
  return { connection, state, connectionState, connectionError, connect, disconnect, refresh, acceptState,
    reconnect: () => setAttempt(value => value + 1) };
}
