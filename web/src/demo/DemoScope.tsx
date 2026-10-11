import { useLayoutEffect, useState, type ReactNode } from "react";
import { setDataSource } from "../api.js";
import { DemoEngine } from "./engine.js";

export function DemoScope({ children }: { children: ReactNode }) {
  const [engine] = useState(() => new DemoEngine());
  useLayoutEffect(() => {
    setDataSource(engine);
    engine.start();
    return () => {
      engine.dispose();
      setDataSource(null);
    };
  }, [engine]);
  return <>{children}</>;
}
