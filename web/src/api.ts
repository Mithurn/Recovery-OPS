import type { CaseDetail, RecoveryCase, RoomMetrics, RoomStreamEvent, StreamEvent } from "./types.js";

const BASE = "/api";

export type RuntimeConfig = {
  model: string;
  deadlineMs: number;
  stepBudget: number;
  limits: { maxAttempts: number; maxExposurePaise: number; cooldownHours: number };
};

export type AuditVerify = { enforced: boolean; role: string; error?: string };

export type PayInfo =
  | { payable: false }
  | { payable: true; kind: "order"; orderId: string; amountPaise: number; currency: string }
  | { payable: true; kind: "payment_link"; url: string; amountPaise: number };

export const UNAUTHORIZED_EVENT = "recoveryops:unauthorized";

async function readError(res: Response, path: string): Promise<Error> {
  const body = await res.json().catch(() => null);
  const detail = body && typeof body.error === "string" ? body.error : null;
  return new Error(detail ?? `${path}: ${res.status}`);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401 && !path.startsWith("/auth/")) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  if (!res.ok) throw await readError(res, path);
  return res.json() as Promise<T>;
}

const get = <T>(path: string) => request<T>("GET", path);
const post = <T>(path: string, body?: unknown) => request<T>("POST", path, body);

export type User = { id: string; email: string };
export type Credentials =
  | { connected: false }
  | { connected: true; keyId: string; webhookUrl: string; webhookSecret: string };
export type Scenario = { id: string; label: string; amountPaise: number; method: string; errorReason: string };

export const isBackendUp = () => fetch(`${BASE}/health`).then((r) => r.ok).catch(() => false);
export const currentUser = () => get<{ user: User }>("/auth/me").then((r) => r.user);
export const requestCode = (email: string) => post<{ sent: true }>("/auth/request", { email });
export const verifyCode = (email: string, code: string) => post<{ user: User }>("/auth/verify", { email, code }).then((r) => r.user);
export const logout = () => post<{ ok: true }>("/auth/logout");
export const getCredentials = () => get<Credentials>("/credentials");
export const saveCredentials = (keyId: string, keySecret: string) => request<Credentials>("PUT", "/credentials", { keyId, keySecret });
export const removeCredentials = () => request<Credentials>("DELETE", "/credentials");
type ActivityEvent = { id: string; caseId: string; type: string; payload: Record<string, unknown>; createdAt: string };
type DecisionBody = { decision: "approve" | "redirect" | "write_off"; redirectTo?: string; note?: string };

export interface DataSource {
  recentActivity(limit?: number): Promise<ActivityEvent[]>;
  scenarios(): Promise<Scenario[]>;
  simulate(scenario: string): Promise<unknown>;
  listCases(): Promise<RecoveryCase[]>;
  queue(): Promise<RecoveryCase[]>;
  caseDetail(id: string): Promise<CaseDetail>;
  runtimeConfig(): Promise<RuntimeConfig>;
  payInfo(id: string): Promise<PayInfo>;
  verifyAudit(id: string): Promise<AuditVerify>;
  metrics(): Promise<RoomMetrics>;
  recover(id: string): Promise<void>;
  simulateCapture(id: string): Promise<void>;
  decide(id: string, body: DecisionBody): Promise<void>;
  stopCase(id: string, note?: string): Promise<void>;
  stopAll(note?: string): Promise<{ stoppedNow: number }>;
  resumeAll(): Promise<void>;
  streamCase(id: string, signal: AbortSignal): AsyncGenerator<StreamEvent>;
  streamRoom(signal: AbortSignal): AsyncGenerator<RoomStreamEvent>;
}

// SSE reader as an async generator: fetch -> reader -> split on \n\n -> JSON.parse the data line.
async function* readSse<T>(path: string, signal: AbortSignal): AsyncGenerator<T> {
  const res = await fetch(`${BASE}${path}`, { signal, headers: { accept: "text/event-stream" } });
  if (res.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  if (!res.ok || !res.body) throw new Error(`${path}: ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const line = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      try {
        yield JSON.parse(line.slice(6)) as T;
      } catch {
        /* keep-alive comment or partial */
      }
    }
  }
}

const liveSource: DataSource = {
  recentActivity: (limit = 40) => get<{ events: ActivityEvent[] }>(`/activity?limit=${limit}`).then((r) => r.events),
  scenarios: () => get<{ scenarios: Scenario[] }>("/scenarios").then((r) => r.scenarios),
  simulate: (scenario) => post<unknown>("/simulate", { scenario }),
  listCases: () => get<{ cases: RecoveryCase[] }>("/cases").then((r) => r.cases),
  queue: () => get<{ cases: RecoveryCase[] }>("/queue").then((r) => r.cases),
  caseDetail: (id) => get<CaseDetail>(`/cases/${id}`),
  runtimeConfig: () => get<RuntimeConfig>("/config"),
  payInfo: (id) => get<PayInfo>(`/cases/${id}/pay`),
  verifyAudit: (id) => get<AuditVerify>(`/cases/${id}/audit/verify`),
  metrics: () => get<RoomMetrics>("/metrics"),
  recover: async (id) => void (await post(`/cases/${id}/recover`)),
  simulateCapture: async (id) => void (await post(`/cases/${id}/simulate-capture`)),
  decide: async (id, body) => void (await post(`/cases/${id}/decision`, body)),
  // Safe-checkpoint stop: never aborts a call already in flight to Razorpay or the model, only
  // prevents the next action. stopAll is the emergency brake; resumeAll lifts it for new cases.
  stopCase: async (id, note) => void (await post(`/cases/${id}/stop`, note ? { note } : undefined)),
  stopAll: (note) => post(`/stop`, note ? { note } : undefined),
  resumeAll: async () => void (await post(`/resume`)),
  streamCase: (id, signal) => readSse<StreamEvent>(`/cases/${id}/stream`, signal),
  streamRoom: (signal) => readSse<RoomStreamEvent>("/stream", signal),
};

let source: DataSource = liveSource;

export function setDataSource(next: DataSource | null): void {
  source = next ?? liveSource;
}

export const recentActivity = (limit?: number) => source.recentActivity(limit);
export const scenarios = () => source.scenarios();
export const simulate = (scenario: string) => source.simulate(scenario);
export const listCases = () => source.listCases();
export const queue = () => source.queue();
export const caseDetail = (id: string) => source.caseDetail(id);
export const runtimeConfig = () => source.runtimeConfig();
export const payInfo = (id: string) => source.payInfo(id);
export const verifyAudit = (id: string) => source.verifyAudit(id);
export const metrics = () => source.metrics();
export const recover = (id: string) => source.recover(id);
export const simulateCapture = (id: string) => source.simulateCapture(id);
export const decide = (id: string, body: DecisionBody) => source.decide(id, body);
export const stopCase = (id: string, note?: string) => source.stopCase(id, note);
export const stopAll = (note?: string) => source.stopAll(note);
export const resumeAll = () => source.resumeAll();
export const streamCase = (id: string, signal: AbortSignal) => source.streamCase(id, signal);
export const streamRoom = (signal: AbortSignal) => source.streamRoom(signal);
