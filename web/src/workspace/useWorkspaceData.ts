import { useCallback, useEffect, useRef, useState } from "react";
import { listCases, queue } from "../api.js";
import { backoffDelay } from "../loop/reconnectingStream.js";
import { useRoomStream } from "../room/useRoomStream.js";
import type { RecoveryCase } from "../types.js";
import { useActivityFeed } from "./feed";

const REFRESH_MS = 2000;
const REFRESH_MAX_MS = 30000;

export function useWorkspaceData(onError: (message: string) => void) {
  const room = useRoomStream();
  const feed = useActivityFeed(room.bus);
  const [cases, setCases] = useState<RecoveryCase[]>([]);
  const [escalations, setEscalations] = useState<RecoveryCase[]>([]);
  const latestRequest = useRef(0);
  const failures = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++latestRequest.current;
    try {
      const [all, escalated] = await Promise.all([listCases(), queue()]);
      if (request !== latestRequest.current) return;
      failures.current = 0;
      setCases(all);
      setEscalations(escalated);
    } catch (err) {
      if (request !== latestRequest.current) return;
      failures.current += 1;
      if (failures.current === 1) onError(err instanceof Error ? err.message : "request failed");
    }
  }, [onError]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (!document.hidden) await refresh();
      if (!stopped) timer = setTimeout(tick, backoffDelay(failures.current, REFRESH_MS, REFRESH_MAX_MS));
    };
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    void tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  useEffect(() => {
    if (room.version > 0) void refresh();
  }, [room.version, refresh]);

  return { room, feed, cases, escalations, refresh };
}
