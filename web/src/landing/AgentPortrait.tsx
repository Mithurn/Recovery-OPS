import { useEffect, useRef } from "react";
import { sceneFrameBufs, SCENE_H, SCENE_W, type AgentId } from "../floor/sprites";

const SCALE = 5;

export function AgentPortrait({ agent }: { agent: AgentId }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const image = ctx.createImageData(SCENE_W, SCENE_H);
    image.data.set(sceneFrameBufs(agent).front[0]!);
    const stage = document.createElement("canvas");
    stage.width = SCENE_W;
    stage.height = SCENE_H;
    stage.getContext("2d")!.putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(stage, 0, 0, SCENE_W * SCALE, SCENE_H * SCALE);
  }, [agent]);
  return <canvas ref={ref} className="lp-portrait" width={SCENE_W * SCALE} height={SCENE_H * SCALE} aria-hidden />;
}
