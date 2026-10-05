import { describe, expect, it } from 'vitest';
import { clearBackground } from './logoBackground';

/** 5×5 white image with a red 3×3 square in the middle and a white pixel at its centre. */
function sample(): Uint8ClampedArray {
  const px = new Uint8ClampedArray(5 * 5 * 4).fill(255);
  for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) px.set([200, 0, 0, 255], (y * 5 + x) * 4);
  px.set([255, 255, 255, 255], (2 * 5 + 2) * 4);
  return px;
}

const alpha = (px: Uint8ClampedArray, x: number, y: number) => px[(y * 5 + x) * 4 + 3];

describe('clearBackground', () => {
  it('clears the border-connected background and keeps enclosed areas of the same colour', () => {
    const px = sample();
    expect(clearBackground(px, 5, 5)).toBe(16);
    expect(alpha(px, 0, 0)).toBe(0);
    expect(alpha(px, 1, 1)).toBe(255);
    // White inside the red square is not reachable from the border.
    expect(alpha(px, 2, 2)).toBe(255);
  });

  it('leaves already transparent images alone', () => {
    const px = new Uint8ClampedArray(4 * 4 * 4);
    expect(clearBackground(px, 4, 4)).toBe(0);
  });
});
