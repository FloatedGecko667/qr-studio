import { describe, expect, it } from 'vitest';
import { outputForDistance, symbolMmForDistance } from './distance';

describe('reading distance', () => {
  it('uses one tenth of the distance as the symbol width', () => {
    expect(symbolMmForDistance(0.3)).toBe(30);
    expect(symbolMmForDistance(2)).toBe(200);
  });

  it('adds the quiet zone to the output size', () => {
    // 25 modules + 4 on each side = 33 units; 30 mm symbol = 1.2 mm modules.
    expect(outputForDistance(0.3, 25, 33)).toEqual({ sizeMm: 39.6, moduleMm: 1.2 });
  });
});
