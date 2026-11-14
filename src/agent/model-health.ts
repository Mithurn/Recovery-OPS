import { splitModelId } from "./model.js";

const HEALTH_TIMEOUT_MS = 10_000;

export async function checkModelHealth(
  keys: { openRouterApiKey: string | undefined; googleApiKey: string | undefined },
  model: string,
): Promise<{ model: string; reachable: boolean; detail?: string }> {
  const { provider, id } = splitModelId(model);
  if (provider === "google") return checkGoogle(keys.googleApiKey, id);
  return checkOpenRouter(keys.openRouterApiKey, id);
}

async function checkOpenRouter(
  apiKey: string | undefined,
  model: string,
): Promise<{ model: string; reachable: boolean; detail?: string }> {
  if (!apiKey) return { model, reachable: false, detail: "OPENROUTER_API_KEY not set" };
  try {
    const res = await fetch("https://openrouter.ai/api/v1/key", {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    if (res.ok) return { model, reachable: true };
    return { model, reachable: false, detail: `HTTP ${res.status}` };
  } catch (err) {
    return { model, reachable: false, detail: err instanceof Error ? err.message : "unknown error" };
  }
}

async function checkGoogle(
  apiKey: string | undefined,
  model: string,
): Promise<{ model: string; reachable: boolean; detail?: string }> {
  if (!apiKey) return { model: `google/${model}`, reachable: false, detail: "GOOGLE_GENERATIVE_AI_API_KEY not set" };
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`, {
      headers: { "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    if (res.ok) return { model: `google/${model}`, reachable: true };
    return { model: `google/${model}`, reachable: false, detail: `HTTP ${res.status}` };
  } catch (err) {
    return { model: `google/${model}`, reachable: false, detail: err instanceof Error ? err.message : "unknown error" };
  }
}
