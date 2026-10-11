import { useCallback, useEffect, useState } from "react";
import { currentUser, getCredentials, logout, UNAUTHORIZED_EVENT, type Credentials, type User } from "../api.js";
import { Spinner } from "../ui/motion.js";
import { Login } from "./Login.js";

export type Session = {
  user: User;
  creds: Credentials;
  setCreds: (creds: Credentials) => void;
  signOut: () => Promise<void>;
};

type State = { phase: "loading" } | { phase: "anonymous" } | { phase: "signed-in"; user: User; creds: Credentials };

export function Gate({ children }: { children: (session: Session) => React.ReactNode }) {
  const [state, setState] = useState<State>({ phase: "loading" });

  const load = useCallback(async () => {
    try {
      const user = await currentUser();
      setState({ phase: "signed-in", user, creds: await getCredentials() });
    } catch {
      setState({ phase: "anonymous" });
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
