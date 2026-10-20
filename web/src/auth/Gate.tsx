import { useCallback, useEffect, useState } from "react";
import { currentUser, getCredentials, isBackendUp, logout, UNAUTHORIZED_EVENT, type Credentials, type User } from "../api.js";
import { Spinner } from "../ui/motion.js";
import { Link, PATHS } from "../routes.js";
import { Login } from "./Login.js";

export type Session = {
  user: User;
  creds: Credentials;
  setCreds: (creds: Credentials) => void;
  signOut: () => Promise<void>;
};

type State = { phase: "loading" } | { phase: "anonymous" } | { phase: "offline" } | { phase: "signed-in"; user: User; creds: Credentials };

export function Gate({ children }: { children: (session: Session) => React.ReactNode }) {
  const [state, setState] = useState<State>({ phase: "loading" });

  const load = useCallback(async () => {
    try {
      const user = await currentUser();
      setState({ phase: "signed-in", user, creds: await getCredentials() });
    } catch {
      setState({ phase: (await isBackendUp()) ? "anonymous" : "offline" });
    }
  }, []);

  useEffect(() => {
    void load();
    const onUnauthorized = () => setState({ phase: "anonymous" });
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [load]);

  if (state.phase === "loading") {
    return (
      <main className="auth">
        <Spinner size={18} />
      </main>
    );
  }
  if (state.phase === "offline") {
    return (
      <main className="auth">
        <section className="auth__card">
          <h1 className="auth__title">Live backend is offline</h1>
          <p className="auth__lede">The live workspace is switched off to save cost. The replay shows the full flow.</p>
          <Link className="auth__link" to={PATHS.demo}>
            Open the demo
          </Link>
        </section>
      </main>
    );
  }
  if (state.phase === "anonymous") return <Login onSignedIn={() => void load()} />;

  const { user, creds } = state;
  const setCreds = (next: Credentials) => setState({ phase: "signed-in", user, creds: next });
  return (
    <>
      {children({
        user,
        creds,
        setCreds,
        signOut: async () => {
          await logout().catch(() => undefined);
          setState({ phase: "anonymous" });
        },
      })}
    </>
  );
}
