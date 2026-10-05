import { describe, expect, it } from 'vitest';
import { UndoHistory } from './undo';

describe('UndoHistory', () => {
  it('undoes and redoes snapshots in order', () => {
    const h = new UndoHistory<number>();
    let state = 0;
    const change = (to: number, key: string, at: number) => {
      h.record(state, key, at);
      state = to;
    };
    change(1, 'a', 0);
    change(2, 'b', 1000);
    expect(h.canUndo).toBe(true);
    state = h.undo(state)!;
    expect(state).toBe(1);
    state = h.undo(state)!;
    expect(state).toBe(0);
    expect(h.undo(state)).toBeNull();
    state = h.redo(state)!;
    state = h.redo(state)!;
    expect(state).toBe(2);
    expect(h.canRedo).toBe(false);
  });

  it('merges quick repeats of the same change, not different ones', () => {
    const h = new UndoHistory<string>();
    h.record('#000', 'fg', 0);
    h.record('#111', 'fg', 200);
    h.record('#222', 'fg', 700);
    // The third change came 500 ms after the second: still the same drag.
    expect(h.undo('#333')).toBe('#000');
    expect(h.canUndo).toBe(false);

    h.record('a', 'fg', 5000);
    h.record('b', 'bg', 5100);
    expect(h.undo('c')).toBe('b');
    expect(h.undo('b')).toBe('a');
  });

  it('a new change clears redo; history keeps the latest 50 steps', () => {
    const h = new UndoHistory<number>(50);
    for (let i = 0; i < 60; i++) h.record(i, 'k', i * 1000);
    let n = 0;
    let s: number | null = 60;
    while ((s = h.undo(s!)) !== null) {
      n++;
      if (n === 50) expect(s).toBe(10);
    }
    expect(n).toBe(50);

    const g = new UndoHistory<number>();
    g.record(0, 'k', 0);
    expect(g.undo(1)).toBe(0);
    g.record(0, 'other', 10_000);
    expect(g.canRedo).toBe(false);
  });

  it('after an undo the next change is a new step even with the same key', () => {
    const h = new UndoHistory<number>();
    h.record(0, 'k', 0);
    h.undo(1);
    h.record(0, 'k', 100);
    expect(h.canUndo).toBe(true);
  });
});
