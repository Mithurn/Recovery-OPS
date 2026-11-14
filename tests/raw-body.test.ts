import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { keepRawJsonBody } from "../src/api/raw-body.js";

function appWithEcho() {
  const app = Fastify();
  keepRawJsonBody(app);
  app.post("/echo", async (req) => ({
    body: req.body ?? null,
    raw: (req as { rawBody?: string }).rawBody,
  }));
  return app;
}

describe("keepRawJsonBody", () => {
  it("parses JSON and keeps the exact bytes that were sent", async () => {
    const app = appWithEcho();
    const payload = '{ "a":1,  "b" : [1,2] }';
    const res = await app.inject({
      method: "POST",
      url: "/echo",
      headers: { "content-type": "application/json" },
      payload,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ body: { a: 1, b: [1, 2] }, raw: payload });
    await app.close();
  });

  it("treats an empty body as no body", async () => {
    const app = appWithEcho();
    const res = await app.inject({
      method: "POST",
      url: "/echo",
      headers: { "content-type": "application/json" },
      payload: "",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ body: null, raw: "" });
    await app.close();
  });

  it("rejects malformed JSON with a 400, not a 500", async () => {
    const app = appWithEcho();
    const res = await app.inject({
      method: "POST",
      url: "/echo",
      headers: { "content-type": "application/json" },
      payload: "{not json",
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
