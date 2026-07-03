import type { JobHandler } from "./types.js";

/**
 * Generic demo handlers, since this is a generic job-execution platform, not
 * one tied to specific business logic. `payload.handler` selects which one
 * runs; a real deployment would register domain handlers here instead. This
 * registry is the platform's extension point.
 */
const handlers: Record<string, JobHandler> = {
  echo: async (payload, ctx) => {
    ctx.log("info", "echo handler received payload", payload);
    return { echoed: payload };
  },

  sleep: async (payload, ctx) => {
    const ms = typeof payload.ms === "number" ? payload.ms : 1000;
    ctx.log("info", `sleeping for ${ms}ms`);
    await new Promise((resolve) => setTimeout(resolve, ms));
    return { sleptMs: ms };
  },

  "http-request": async (payload, ctx) => {
    const url = typeof payload.url === "string" ? payload.url : undefined;
    if (!url) throw new Error("http-request handler requires a `url` string in payload");
    ctx.log("info", `fetching ${url}`);
    const res = await fetch(url, {
      method: typeof payload.method === "string" ? payload.method : "GET",
    });
    if (!res.ok) {
      throw new Error(`http-request failed: ${res.status} ${res.statusText}`);
    }
    return { status: res.status };
  },

  "fail-always": async () => {
    throw new Error("fail-always handler: deliberate failure for testing retry/DLQ paths");
  },
};

export function resolveHandler(payload: Record<string, unknown>): JobHandler {
  const key = typeof payload.handler === "string" ? payload.handler : "echo";
  const handler = handlers[key];
  if (!handler) throw new Error(`Unknown job handler: "${key}"`);
  return handler;
}
