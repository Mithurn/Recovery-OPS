import { useCallback, useEffect, useState } from "react";
import { listCases, queue } from "../api.js";
import { useRoomStream } from "../room/useRoomStream.js";
import type { RecoveryCase } from "../types.js";
import { useActivityFeed } from "./feed";

const REFRESH_MS = 2000;

export function useWorkspaceData(onError: (message: string) => void) {
  const room = useRoomStream();
  const feed = useActivityFeed(room.bus);
  const [cases, setCases] = useState<RecoveryCase[]>([]);
  const [escalations, setEscalations] = useState<RecoveryCase[]>([]);

  const refresh = useCallback(async () => {
    try {
      const [all, escalated] = await Promise.all([listCases(), queue()]);
      setCases(all);
      setEscalations(escalated);
    } catch (err) {
      onError(err instanceof Error ? err.message : "request failed");
    }
  }, [onError]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (room.version > 0) void refresh();
  }, [room.version, refresh]);

  return { room, feed, cases, escalations, refresh };
}
