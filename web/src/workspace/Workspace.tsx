import { useCallback, useEffect, useMemo, useState } from "react";
import { recover, resumeAll, runtimeConfig, scenarios as fetchScenarios, simulate, stopAll, type RuntimeConfig, type Scenario } from "../api.js";
import type { Session } from "../auth/Gate.js";
import type { AgentId } from "../floor/sprites";
import { Link, navigate, PATHS, usePath } from "../routes.js";
import { useTweenedNumber } from "../room/useTweenedNumber.js";
import { customerLabel, rupees } from "../ui/format.js";
import { OctagonX, PanelRight, X } from "../ui/icons.js";
import { PixelGrid } from "../agentic/AgentLoader.js";
import { Spinner } from "../ui/motion.js";
import { AgentDetails } from "./AgentDetails";
import { CaseDetail } from "./CaseDetail";
import type { CommandContext } from "./commands";
import { CasesPage } from "./CasesPage";
import { FeedList } from "./FeedList";
import { RecoveredCards, useRecoveredPop, useRecoveries } from "./Recovered";
import { RunsPanel } from "./RunsPanel";
import { buildRuns } from "./runs";
import { FloorPage } from "./FloorPage";
import { NeedsPage } from "./NeedsPage";
import { DemoSettings, SettingsPage } from "./SettingsPage";
import { useWorkspaceData } from "./useWorkspaceData";
import "./workspace.css";

export type WorkspaceMode = "live" | "demo";
type Page = "floor" | "cases" | "needs" | "settings";
type PanelTab = "activity" | "agent" | "case";

const PAGES: Array<{ id: Page; label: string; path: string }> = [
  { id: "floor", label: "Agent workspace", path: "" },
  { id: "cases", label: "Cases", path: "/cases" },
  { id: "needs", label: "Needs you", path: "/needs" },
  { id: "settings", label: "Settings", path: "/settings" },
];

function pageFor(path: string, base: string): Page {
  const rest = path.slice(base.length).replace(/^\/+|\/+$/g, "");
  return PAGES.find((p) => p.path.slice(1) === rest)?.id ?? "floor";
}

export function Workspace({ mode, session }: { mode: WorkspaceMode; session: Session | null }) {
  const base = mode === "demo" ? PATHS.demo : PATHS.app;
  const path = usePath();
  const page = pageFor(path, base);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<PanelTab | null>("activity");
  const [agent, setAgent] = useState<AgentId | null>(null);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [cfg, setCfg] = useState<RuntimeConfig | null>(null);
  const [scenarioList, setScenarioList] = useState<Scenario[]>([]);
  const { room, feed, cases, escalations, refresh } = useWorkspaceData(setError);

  const connected = mode === "demo" || session?.creds.connected === true;
  const keyId = session?.creds.connected ? session.creds.keyId : null;

  useEffect(() => {
    runtimeConfig().then(setCfg).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (connected) fetchScenarios().then(setScenarioList).catch(() => undefined);
  }, [connected]);

  useEffect(() => {
    setPanel(page === "floor" ? "activity" : null);
    setAgent(null);
    setCaseId(null);
  }, [page]);

  const openCase = useCallback((id: string) => {
    setCaseId(id);
    setPanel("case");
  }, []);
  const openAgent = useCallback((a: AgentId) => {
    setAgent(a);
    setPanel("agent");
  }, []);
  const retry = useCallback(
    async (id: string) => {
      try {
        await recover(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "could not retry");
      }
    },
    [],
  );

  const commandCtx = useMemo<CommandContext>(
    () => ({
      scenarios: scenarioList,
      cases,
      simulate: (id) => void simulate(id),
      retry,
      open: (id) => {
        setCaseId(id);
        setPanel("case");
      },
      stop: () => void stopAll("command bar"),
      resume: () => void resumeAll(),
    }),
    [scenarioList, cases, retry],
  );
  const waiting = escalations.length;
  const runs = useMemo(() => buildRuns(feed, cases), [feed, cases]);
  const recoveries = useRecoveries(room.bus);
  const nameOf = useCallback((id: string | undefined) => customerLabel(cases.find((c) => c.id === id)?.customerRef ?? "a customer"), [cases]);

  return (
    <div className="ws" data-surface="room">
      <Sidebar base={base} page={page} mode={mode} waiting={waiting} user={session?.user.email ?? null} />
      <div className="ws__main">
        {mode === "demo" && (
          <div className="notice" role="status">
            <span>You are watching a recorded replay. Nothing here touches a real account.</span>
            <Link to={PATHS.app} className="btn btn--primary btn--sm">
              Sign up to use your own keys
            </Link>
          </div>
        )}
        {mode === "live" && !connected && (
          <div className="notice" role="status">
            <span>Connect your Razorpay test keys to start recovering payments.</span>
            <Link to={`${base}/settings`} className="btn btn--primary btn--sm">
              Connect keys
            </Link>
          </div>
        )}
        <RecoveredCards items={recoveries.items} nameOf={nameOf} onOpen={openCase} onDismiss={recoveries.dismiss} />
        {error && (
          <div className="toast" role="alert">
            <span>{error}</span>
            <button className="btn btn--icon btn--ghost" onClick={() => setError(null)} aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        )}

        <Header
          title={PAGES.find((p) => p.id === page)!.label}
          metrics={room.metrics}
          connected={room.connected}
          panelOpen={panel === "activity"}
          onTogglePanel={() => setPanel((p) => (p === "activity" ? null : "activity"))}
          onError={setError}
        />

        <div className="ws__body">
          <main className="ws__page">
            {page === "floor" && (
              <FloorPage
                bus={room.bus}
                canSimulate={connected}
                cases={cases}
                ctx={commandCtx}
                selectedAgent={panel === "agent" ? agent : null}
                onSelectAgent={openAgent}
                onConnect={() => navigate(`${base}/settings`)}
                onError={setError}
              />
            )}
            {page === "cases" && <CasesPage cases={cases} selectedId={panel === "case" ? caseId : null} onOpen={openCase} />}
            {page === "needs" && <NeedsPage escalations={escalations} onDone={() => void refresh()} onOpen={openCase} onError={setError} />}
            {page === "settings" && (session ? <SettingsPage user={session.user} creds={session.creds} onCredsChange={session.setCreds} onSignOut={session.signOut} /> : <DemoSettings />)}
          </main>

          <aside className="panel" data-open={panel !== null} aria-label="Details">
            {panel !== null && (
              <div className="panel__inner">
                <div className="panel__bar">
                  <div className="tabs" role="tablist">
                    <button role="tab" className="tab" aria-selected={panel === "activity"} onClick={() => setPanel("activity")}>
                      Activity
                    </button>
                    {agent && (
                      <button role="tab" className="tab" aria-selected={panel === "agent"} onClick={() => setPanel("agent")}>
                        Agent
                      </button>
                    )}
                    {caseId && (
                      <button role="tab" className="tab" aria-selected={panel === "case"} onClick={() => setPanel("case")}>
                        Case
                      </button>
                    )}
                  </div>
                  <button className="btn btn--icon btn--ghost" onClick={() => setPanel(null)} aria-label="Close panel">
                    <X size={14} />
                  </button>
                </div>
                <div className="panel__body">
                  {panel === "activity" && (
                    <>
                      <RunsPanel runs={runs} onOpenCase={openCase} />
                    </>
                  )}
                  {panel === "agent" && agent && <AgentDetails agent={agent} feed={feed} cases={cases} onRetry={retry} onOpenCase={openCase} />}
                  {panel === "case" && caseId && <CaseDetail caseId={caseId} cfg={cfg} keyId={keyId} onError={setError} />}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function Sidebar({ base, page, mode, waiting, user }: { base: string; page: Page; mode: WorkspaceMode; waiting: number; user: string | null }) {
  const items = PAGES;
  return (
    <aside className="side" aria-label="Workspace">
      <div className="side__head">
        <Link to={PATHS.landing} className="brand">
          <span className="brand__mark" aria-hidden />
          Recovery OPS
        </Link>
        <span className={`env env--${mode}`}>{mode === "demo" ? "Demo" : "Test mode"}</span>
      </div>
      <nav className="nav" aria-label="Pages">
        {items.map((p) => (
          <Link key={p.id} to={`${base}${p.path}`} className="nav__item" aria-current={page === p.id ? "page" : undefined}>
            {p.label}
            {p.id === "needs" && waiting > 0 && <span className="badge tnum">{waiting}</span>}
          </Link>
        ))}
      </nav>
      <div className="side__foot">
        {user ? (
          <>
            <span className="avatar" aria-hidden>
              {user.charAt(0).toUpperCase()}
            </span>
            <span className="side__user">{user}</span>
          </>
        ) : (
          <Link to={PATHS.app} className="btn btn--primary btn--block">
            Sign up
          </Link>
        )}
      </div>
    </aside>
  );
}

function Header({
  title,
  metrics,
  connected,
  panelOpen,
  onTogglePanel,
  onError,
}: {
  title: string;
  metrics: ReturnType<typeof useWorkspaceData>["room"]["metrics"];
  connected: boolean;
  panelOpen: boolean;
  onTogglePanel: () => void;
  onError: (message: string) => void;
}) {
  const recovered = useTweenedNumber(metrics?.recoveredPaise ?? 0);
  const pop = useRecoveredPop(metrics?.recoveredPaise ?? 0);
  const exposure = useTweenedNumber(metrics?.exposurePaise ?? 0);
  const lanes = metrics?.byLane ?? {};
  const working = (lanes.DIAGNOSING ?? 0) + (lanes.DECIDING ?? 0) + (lanes.ATTEMPTING ?? 0);
  const braked = metrics?.braked ?? false;
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = useMemo(
    () => async (fn: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await fn();
      } catch (err) {
        onError(err instanceof Error ? err.message : "request failed");
      } finally {
        setBusy(false);
        setConfirming(false);
      }
    },
    [onError],
  );

  return (
    <header className="head">
      <h1 className="head__title">
        {title}
        {!connected && <span className="head__offline">Reconnecting</span>}
      </h1>
      <div className="head__right">
        <dl className="stats" aria-label="Totals">
          <div className="stat">
            <dt>Recovered</dt>
            <dd key={pop.popKey} className={"tnum" + (pop.popKey > 0 ? " stat__pop" : "")}>
              {rupees(recovered)}
              {pop.popKey > 0 && <span className="stat__delta">+{rupees(pop.delta)}</span>}
            </dd>
          </div>
          <div className="stat">
            <dt>At risk</dt>
            <dd className="tnum">{rupees(exposure)}</dd>
          </div>
          <div className="stat">
            <dt>Working</dt>
            <dd className="tnum">
              {working > 0 && <PixelGrid />}
              {working}
            </dd>
          </div>
        </dl>
        <button className="btn btn--icon" aria-pressed={panelOpen} onClick={onTogglePanel} aria-label={panelOpen ? "Hide activity" : "Show activity"} title="Activity">
          <PanelRight size={15} />
        </button>
        {braked ? (
          <button className="btn btn--sm" disabled={busy} onClick={() => void run(() => resumeAll())}>
            Resume
          </button>
        ) : confirming ? (
          <span className="confirm">
            Stop everything?
            <button className="btn btn--sm btn--danger" disabled={busy} onClick={() => void run(() => stopAll("emergency stop"))}>
              {busy ? <Spinner size={12} /> : "Stop"}
            </button>
            <button className="btn btn--sm" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </span>
        ) : (
          <button className="btn btn--icon btn--quiet-danger" onClick={() => setConfirming(true)} aria-label="Emergency stop" title="Emergency stop">
            <OctagonX size={15} />
          </button>
        )}
      </div>
    </header>
  );
}
