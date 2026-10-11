import { useEffect, useRef } from 'react';
import type { RoomBus } from '../room/roomBus';
import { FloorScene } from './FloorScene';
import { actionsFor } from './floorModel';
import { DESKS } from './layout';
import type { AgentId } from './sprites';

export function RecoveryFloor({
  bus,
  onSelectAgent,
  selected,
}: {
  bus: RoomBus;
  onSelectAgent?: (agent: AgentId) => void;
  selected: AgentId | null;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<FloorScene | null>(null);
  const onSelectRef = useRef(onSelectAgent);
  onSelectRef.current = onSelectAgent;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let scene: FloorScene | null = null;
    let disposed = false;
    const pending: ReturnType<typeof actionsFor>[] = [];

    FloorScene.create(host, { onSelectAgent: (agent) => onSelectRef.current?.(agent) }).then((created) => {
      if (disposed) {
        created.destroy();
        return;
      }
      scene = created;
      sceneRef.current = created;
      for (const batch of pending) created.enqueue(batch);
      pending.length = 0;
    });

    const off = bus.subscribe((event) => {
      const batch = actionsFor(event);
      if (scene) scene.enqueue(batch);
      else pending.push(batch);
    });

    return () => {
      disposed = true;
      off();
      sceneRef.current = null;
      scene?.destroy();
    };
  }, [bus]);

  useEffect(() => {
    sceneRef.current?.setSelected(selected);
  }, [selected]);

  return (
    <>
      <div ref={hostRef} className="floor" aria-hidden />
      {onSelectAgent && (
        <div className="sr-only" role="group" aria-label="Agents">
          {DESKS.map((d) => (
            <button key={d.agent} onClick={() => onSelectAgent(d.agent)}>
              {d.name} details
            </button>
          ))}
        </div>
      )}
    </>
  );
}
