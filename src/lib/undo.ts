/**
 * Undo/redo of settings as whole snapshots. `record` is called with the state as it was before a
 * change; quick repeats of the same kind of change (dragging a slider or colour picker) merge into
 * one step.
 */
export class UndoHistory<T> {
  private past: T[] = [];
  private future: T[] = [];
  private lastKey = '';
  private lastAt = -Infinity;

  constructor(
    private readonly limit = 50,
    private readonly mergeMs = 600,
  ) {}

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  record(before: T, key: string, now = Date.now()): void {
    const merge = key === this.lastKey && now - this.lastAt < this.mergeMs;
    this.lastKey = key;
    this.lastAt = now;
    if (merge) return;
    this.past.push(before);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }

  /** Returns the state to go back to (and remembers `current` for redo), or null at the start. */
  undo(current: T): T | null {
    const prev = this.past.pop();
    if (prev === undefined) return null;
    this.future.push(current);
    this.lastKey = '';
    return prev;
  }

  redo(current: T): T | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(current);
    this.lastKey = '';
    return next;
  }
}

/** What the undo buttons and shortcuts act on: the generator of the current mode. */
export interface Undoable {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  undo(): void;
  redo(): void;
}
