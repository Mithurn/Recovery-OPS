import { useCallback, useState } from "react";

export function useReplay(): [number, () => void] {
  const [run, setRun] = useState(0);
  const replay = useCallback(() => setRun((n) => n + 1), []);
  return [run, replay];
}
