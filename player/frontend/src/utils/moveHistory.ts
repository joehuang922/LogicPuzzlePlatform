/**
 * Reverse (undo/redo) history over full board snapshots — the web twin of the
 * Android `MoveHistory` (ui/screens/MoveHistory.kt), kept pure so it can be
 * unit-tested directly.
 *
 * Each entry is a `userValues` map captured *before* a move. A "move" is one tap,
 * key press or one whole drag: a pointer gesture is bracketed by
 * [beginStroke]/[endStroke] so only its first mutation records a baseline,
 * collapsing the sweep into a single reverse step. [undo] moves the last pre-move
 * snapshot into the redo stack (handing back the state to restore) and [redo] does
 * the reverse. Any fresh [record] clears the redo stack. The undo stack is capped
 * at `maxDepth` moves (oldest dropped).
 */
export type Values = Record<string, number>;

export class MoveHistory {
  private undoStack: Values[] = [];
  private redoStack: Values[] = [];
  private strokeActive = false;
  private strokeBaseline: Values | null = null;
  private strokePushed = false;

  constructor(private readonly maxDepth = 100) {}

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Clear all history and any in-flight stroke (fresh baseline after a load). */
  reset(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.endStroke();
  }

  /** Begin a gesture whose mutations collapse into one step; [current] is its baseline. */
  beginStroke(current: Values): void {
    this.strokeActive = true;
    this.strokePushed = false;
    this.strokeBaseline = current;
  }

  /** End the current gesture. A following [record] is a standalone move again. */
  endStroke(): void {
    this.strokeActive = false;
    this.strokePushed = false;
    this.strokeBaseline = null;
  }

  /**
   * Record the pre-move snapshot [before]. Outside a stroke every call records;
   * inside one only the first does (using the stroke baseline). Recording always
   * discards the redo future.
   */
  record(before: Values): void {
    if (this.strokeActive) {
      if (!this.strokePushed) {
        this.push(this.strokeBaseline ?? before);
        this.strokePushed = true;
      }
    } else {
      this.push(before);
    }
  }

  private push(before: Values): void {
    this.undoStack.push(before);
    while (this.undoStack.length > this.maxDepth) this.undoStack.shift();
    this.redoStack = [];
  }

  /** Step back: [current] is saved for redo; returns the snapshot to restore, or null. */
  undo(current: Values): Values | null {
    const prev = this.undoStack.pop();
    if (prev === undefined) return null;
    this.redoStack.push(current);
    return prev;
  }

  /** Step forward: [current] is saved for undo; returns the snapshot to re-apply, or null. */
  redo(current: Values): Values | null {
    const next = this.redoStack.pop();
    if (next === undefined) return null;
    this.undoStack.push(current);
    return next;
  }
}

/**
 * Order-insensitive equality of two values maps (boards re-emit unchanged maps on
 * every render). A 0 entry counts as absent: some boards drop empty cells, others
 * keep them as 0.
 */
export function sameValues(a: Values, b: Values): boolean {
  for (const k of Object.keys(a)) if ((a[k] ?? 0) !== (b[k] ?? 0)) return false;
  for (const k of Object.keys(b)) if ((a[k] ?? 0) !== (b[k] ?? 0)) return false;
  return true;
}
