import { EventEmitter } from "node:events";
import type { FastifyReply, FastifyRequest } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openSse } from "../src/api/sse.js";

function fakeStream() {
  const writes: string[] = [];
  const head = vi.fn();
  const reqRaw = new EventEmitter();
  const req = { raw: reqRaw } as unknown as FastifyRequest;
  const reply = {
    raw: { writeHead: head, write: (chunk: string) => writes.push(chunk) },
  } as unknown as FastifyReply;
  return { req, reply, reqRaw, writes, head };
}

describe("openSse", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends SSE headers, then the open event, then live and snapshot events as data frames", async () => {
    const { req, reply, writes, head } = fakeStream();
    let push: (e: unknown) => void = () => undefined;

    openSse(
      req,
      reply,
      { type: "open" },
      (send) => {
        push = send;
        return () => undefined;
      },
      async (send) => send({ type: "snapshot" }),
    );
    push({ type: "live" });

    expect(head).toHaveBeenCalledWith(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    expect(writes[0]).toBe('data: {"type":"open"}\n\n');
    expect(writes).toContain('data: {"type":"snapshot"}\n\n');
    expect(writes).toContain('data: {"type":"live"}\n\n');
  });

  it("subscribes before it reads the snapshot so no event is missed in between", () => {
    const { req, reply } = fakeStream();
    const order: string[] = [];
    openSse(
      req,
      reply,
      {},
      () => {
        order.push("subscribe");
        return () => undefined;
      },
      async () => {
        order.push("snapshot");
      },
    );
    expect(order).toEqual(["subscribe", "snapshot"]);
  });

  it("pings every 15s to keep the connection alive", () => {
    const { req, reply, writes } = fakeStream();
    openSse(req, reply, {}, () => () => undefined, async () => undefined);
    const before = writes.length;
    vi.advanceTimersByTime(15_000);
    expect(writes.slice(before)).toEqual([": ping\n\n"]);
    vi.advanceTimersByTime(30_000);
    expect(writes.filter((w) => w === ": ping\n\n")).toHaveLength(3);
  });

  it("stops pinging and unsubscribes when the client disconnects", () => {
    const { req, reply, reqRaw, writes } = fakeStream();
    const unsubscribe = vi.fn();
    openSse(req, reply, {}, () => unsubscribe, async () => undefined);

    reqRaw.emit("close");
    const after = writes.length;
    vi.advanceTimersByTime(60_000);

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(writes).toHaveLength(after);
  });
});
