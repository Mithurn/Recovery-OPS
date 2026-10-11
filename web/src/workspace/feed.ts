import { useCallback, useEffect, useRef, useState } from "react";
import { recentActivity } from "../api.js";
import { describeEvent, type FeedLine } from "../floor/floorModel";
import type { RoomBus } from "../room/roomBus";

export type FeedEntry = FeedLine & { id: number; caseId?: string; at: number };

const FEED_LIMIT = 80;

export function useActivityFeed(bus: RoomBus): FeedEntry[] {
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const nextId = useRef(0);

  const add = useCallback((line: FeedLine, caseId: string | undefined, at: number) => {
    const entry: FeedEntry = { ...line, id: nextId.current++, caseId, at };
    setFeed((prev) => [entry, ...prev].slice(0, FEED_LIMIT));
  }, []);

  useEffect(() => {
    let cancelled = false;
    recentActivity()
      .then((events) => {
        if (cancelled) return;
        const history: FeedEntry[] = [];
        for (const e of events) {
          const line = describeEvent({ eventType: e.type, payload: e.payload });
          if (line) history.push({ ...line, id: nextId.current++, caseId: e.caseId, at: Date.parse(e.createdAt) });
        }
        setFeed((live) => [...live, ...history].slice(0, FEED_LIMIT));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () =>
      bus.subscribe((event) => {
        const line = describeEvent(event);
        if (line) add(line, event.caseId, event.at ? Date.parse(event.at) : Date.now());
      }),
    [bus, add],
  );

  return feed;
}
