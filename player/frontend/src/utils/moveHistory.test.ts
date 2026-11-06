import { describe, expect, it } from "vitest";
import { MoveHistory, sameValues, type Values } from "./moveHistory";

/** A "current board" plus history, driven the way the Play page drives them. */
function harness(maxDepth = 100) {
  const history = new MoveHistory(maxDepth);
  let current: Values = {};
  const apply = (key: string, value: number) => {
    const next = { ...current };
    if (value === 0) delete next[key];
    else next[key] = value;
    current = next;
  };
  return {
    history,
    get current() {
      return current;
    },
    move(key: string, value: number) {
      history.record(current);
      apply(key, value);
    },
    drag(...sets: [string, number][]) {
      history.beginStroke(current);
      for (const [key, value] of sets) {
        history.record(current);
        apply(key, value);
      }
      history.endStroke();
    },
    undo() {
      const prev = history.undo(current);
      if (prev) current = prev;
    },
    redo() {
      const next = history.redo(current);
      if (next) current = next;
    },
  };
}

describe("MoveHistory", () => {
  it("undo restores the previous state and redo re-applies it", () => {
    const h = harness();
    h.move("a", 1);
    h.move("b", 1);
    expect(h.history.canUndo).toBe(true);
    expect(h.history.canRedo).toBe(false);

    h.undo();
    expect(h.current).toEqual({ a: 1 });
    h.undo();
    expect(h.current).toEqual({});
    expect(h.history.canUndo).toBe(false);

    h.redo();
    h.redo();
    expect(h.current).toEqual({ a: 1, b: 1 });
    expect(h.history.canRedo).toBe(false);
  });

  it("a new move after undo discards the redo future", () => {
    const h = harness();
    h.move("a", 1);
    h.move("b", 1);
    h.move("c", 1);
    h.undo();
    h.undo();
    h.move("d", 1);
    expect(h.current).toEqual({ a: 1, d: 1 });
    expect(h.history.canRedo).toBe(false);
    h.undo();
    expect(h.current).toEqual({ a: 1 });
    h.undo();
    expect(h.current).toEqual({});
    expect(h.history.canUndo).toBe(false);
  });

  it("a drag is a single reverse step, interleaved with taps", () => {
    const h = harness();
    h.move("a", 1);
    h.drag(["b", 1], ["c", 1]);
    h.move("d", 1);
    h.undo();
    expect(h.current).toEqual({ a: 1, b: 1, c: 1 });
    h.undo();
    expect(h.current).toEqual({ a: 1 });
    h.redo();
    expect(h.current).toEqual({ a: 1, b: 1, c: 1 });
  });

  it("a gesture that changes nothing records nothing", () => {
    const h = harness();
    h.drag();
    expect(h.history.canUndo).toBe(false);
  });

  it("is capped at maxDepth, dropping the oldest moves", () => {
    const h = harness(100);
    for (let i = 0; i < 150; i++) h.move(`k${i}`, 1);
    let undos = 0;
    while (h.history.canUndo) {
      h.undo();
      undos++;
    }
    expect(undos).toBe(100);
    expect(h.current.k49).toBe(1);
    expect(h.current.k50).toBeUndefined();
  });

  it("reset clears both stacks; empty undo/redo return null", () => {
    const h = harness();
    h.move("a", 1);
    h.undo();
    h.history.reset();
    expect(h.history.canUndo).toBe(false);
    expect(h.history.canRedo).toBe(false);
    expect(new MoveHistory().undo({ a: 1 })).toBeNull();
    expect(new MoveHistory().redo({ a: 1 })).toBeNull();
  });
});

describe("sameValues", () => {
  it("ignores key order and treats 0 as absent", () => {
    expect(sameValues({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(sameValues({ a: 1, b: 0 }, { a: 1 })).toBe(true);
    expect(sameValues({ a: 1 }, { a: 2 })).toBe(false);
    expect(sameValues({ a: 1 }, { a: 1, b: 1 })).toBe(false);
  });
});
