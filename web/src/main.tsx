import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/fonts.css";
import "./styles/tokens.css";
import "./styles/base.css";
import { App } from "./App";
import { DemoApp } from "./DemoApp";
import { Landing } from "./landing/Landing";
import { PATHS, usePath } from "./routes";

document.body.setAttribute("data-surface", "room");

function Root() {
  const path = usePath();
  if (path.startsWith(PATHS.app)) return <App />;
  if (path.startsWith(PATHS.demo)) return <DemoApp />;
  return <Landing />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
