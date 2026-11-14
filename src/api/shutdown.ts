export type ShutdownStep = { name: string; run: () => Promise<unknown> | unknown };

export type ShutdownOptions = {
  steps: ShutdownStep[];
  timeoutMs: number;
  exit: (code: number) => void;
  log: (message: string, error?: unknown) => void;
};

export function createShutdown({ steps, timeoutMs, exit, log }: ShutdownOptions): () => Promise<void> {
  let started: Promise<void> | null = null;
  return () => {
    started ??= (async () => {
      const forced = setTimeout(() => {
        log("shutdown timed out, forcing exit");
        exit(1);
      }, timeoutMs);
      forced.unref();
      let failed = false;
      for (const step of steps) {
        try {
          await step.run();
        } catch (error) {
          failed = true;
          log(`shutdown step failed: ${step.name}`, error);
        }
      }
      clearTimeout(forced);
      exit(failed ? 1 : 0);
    })();
    return started;
  };
}
