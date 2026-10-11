import type { FastifyInstance } from "fastify";

// Keeps the raw JSON bytes so the Razorpay webhook HMAC verifies against exactly what was sent.
export function keepRawJsonBody(app: FastifyInstance): void {
  app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
    (req as { rawBody?: string }).rawBody = body as string;
    try {
      done(null, body === "" ? undefined : JSON.parse(body as string));
    } catch (err) {
      const parseError = err as Error & { statusCode?: number };
      parseError.statusCode = 400;
      done(parseError, undefined);
    }
  });
}
