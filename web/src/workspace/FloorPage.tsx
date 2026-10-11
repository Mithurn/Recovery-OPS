import { useEffect, useRef, useState } from "react";
import { RecoveryFloor } from "../floor/RecoveryFloor";
import type { AgentId } from "../floor/sprites";
import type { RoomBus } from "../room/roomBus";
import type { RecoveryCase } from "../types.js";
import { Maximize2, Minimize2 } from "../ui/icons.js";
import { CommandBar } from "./CommandBar";
import type { CommandContext } from "./commands";

export function FloorPage({
  bus,
  canSimulate,
  cases,
  ctx,
  selectedAgent,
  onSelectAgent,
  onConnect,
  onError,
}: {
  bus: RoomBus;
  canSimulate: boolean;
  cases: RecoveryCase[];
  ctx: CommandContext;
  selectedAgent: AgentId | null;
  onSelectAgent: (agent: AgentId) => void;
  onConnect: () => void;
  onError: (message: string) => void;
}) {
  const heroRef = useRef<HTMLDivElement>(null);
  const [fullView, setFullView] = useState(false);

  useEffect(() => {
    const sync = () => setFullView(document.fullscreenElement === heroRef.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const toggleFullView = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await heroRef.current?.requestFullscreen();
    } catch {
      onError("Full view is not available in this browser");
    }
  };

  return (
    <div className="hero" ref={heroRef}>
      <RecoveryFloor bus={bus} onSelectAgent={onSelectAgent} selected={selectedAgent} />

      <button className="hero__full btn btn--icon" onClick={() => void toggleFullView()} aria-label={fullView ? "Exit full view" : "Full view"} title="Full view">
        {fullView ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
      </button>

      <CommandBar ctx={ctx} disabled={!canSimulate} onError={onError} />

      {cases.length === 0 && (
        <div className="hero__empty">
          <div className="card empty">
            {canSimulate ? (
              <>
                <h3>No failed payments yet</h3>
                <p>Simulate one and watch five agents investigate it, pass it through the safety gate, and recover it.</p>
              </>
            ) : (
              <>
                <h3>Connect Razorpay to begin</h3>
                <p>Add your test mode keys and failed payments will start moving across this floor.</p>
                <button className="btn btn--primary" onClick={onConnect}>
                  Connect keys
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
