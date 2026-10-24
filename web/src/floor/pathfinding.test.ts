import { describe, expect, it } from "vitest";
import { findPath, type Walkable } from "./pathfinding.js";

function gridOf(rows: string[]): Walkable {
  return {
    width: rows[0].length,
    height: rows.length,
    isWalkable: (x, y) => rows[y]?.[x] === ".",
  };
}

describe("findPath", () => {
  it("returns an empty path when already at the goal", () => {
    expect(findPath(gridOf(["..."]), { x: 1, y: 0 }, { x: 1, y: 0 })).toEqual([]);
  });

  it("walks a straight corridor, excluding the start and including the goal", () => {
    expect(findPath(gridOf(["...."]), { x: 0, y: 0 }, { x: 3, y: 0 })).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ]);
  });

  it("routes around walls with the shortest 4-directional path", () => {
    const path = findPath(gridOf(["...", ".#.", "..."]), { x: 0, y: 0 }, { x: 2, y: 2 });
    expect(path).toHaveLength(4);
    expect(path!.at(-1)).toEqual({ x: 2, y: 2 });
    for (const step of path!) expect(step).not.toEqual({ x: 1, y: 1 });
  });

  it("takes only orthogonal steps", () => {
    const path = findPath(gridOf(["...", "...", "..."]), { x: 0, y: 0 }, { x: 2, y: 2 })!;
    let prev = { x: 0, y: 0 };
    for (const step of path) {
      expect(Math.abs(step.x - prev.x) + Math.abs(step.y - prev.y)).toBe(1);
      prev = step;
    }
  });

  it("returns null when the goal is not walkable", () => {
    expect(findPath(gridOf(["..#"]), { x: 0, y: 0 }, { x: 2, y: 0 })).toBeNull();
  });

  it("returns null when the goal is walled off", () => {
    expect(findPath(gridOf([".#."]), { x: 0, y: 0 }, { x: 2, y: 0 })).toBeNull();
  });

  it("does not walk off the edge of the map", () => {
    expect(findPath(gridOf(["."]), { x: 0, y: 0 }, { x: 5, y: 0 })).toBeNull();
  });
});
