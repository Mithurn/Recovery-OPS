import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./styles/fonts.css";
import "./styles/tokens.css";
import "./styles/base.css";
import { Landing } from "./landing/Landing";
import { PATHS, usePath } from "./routes";

const App = lazy(() => import("./App").then((m) => ({ default: m.App })));
const DemoApp = lazy(() => import("./DemoApp").then((m) => ({ default: m.DemoApp })));

document.body.setAttribute("data-surface", "room");

function Root() {
  const path = usePath();
  if (path.startsWith(PATHS.app))
    return (
      <Suspense fallback={null}>
        <App />
      </Suspense>
    );
  if (path.startsWith(PATHS.demo))
    return (
      <Suspense fallback={null}>
        <DemoApp />
      </Suspense>
    );
  return <Landing />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
