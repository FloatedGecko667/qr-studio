import { describe, expect, it } from 'vitest';
import { launchTarget } from './launch';

describe('launchTarget', () => {
  it('reads a known mode and tab', () => {
    expect(launchTarget('?mode=barcode&tab=scan')).toEqual({ mode: 'barcode', tab: 'scan', shared: undefined });
    expect(launchTarget('?tab=history')).toEqual({ mode: undefined, tab: 'history', shared: undefined });
  });

  it('ignores unknown values and other parameters', () => {
    expect(launchTarget('?mode=evil&tab=<script>&text=secret&shared=x')).toEqual({ mode: undefined, tab: undefined, shared: undefined });
    expect(launchTarget('')).toEqual({ mode: undefined, tab: undefined, shared: undefined });
  });

  it('reads the share target flag', () => {
    expect(launchTarget('?tab=scan&shared=1')).toMatchObject({ tab: 'scan', shared: 'files' });
    expect(launchTarget('?tab=scan&shared=error')).toMatchObject({ shared: 'error' });
  });
});
