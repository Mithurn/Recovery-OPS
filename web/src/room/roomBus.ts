import type { FloorEvent } from "../floor/floorModel";

type Listener = (event: FloorEvent) => void;

export class RoomBus {
  private readonly listeners = new Set<Listener>();

  emit(event: FloorEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
