import { describe, expect, it } from 'vitest';
import { launchTarget } from './launch';

describe('launchTarget', () => {
  it('reads a known mode and tab', () => {
    expect(launchTarget('?mode=barcode&tab=scan')).toEqual({ mode: 'barcode', tab: 'scan' });
    expect(launchTarget('?tab=history')).toEqual({ mode: undefined, tab: 'history' });
  });

  it('ignores unknown values and other parameters', () => {
    expect(launchTarget('?mode=evil&tab=<script>&text=secret')).toEqual({ mode: undefined, tab: undefined });
    expect(launchTarget('')).toEqual({ mode: undefined, tab: undefined });
  });
});
