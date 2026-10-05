import { loadJson, saveJson } from '../storage/local';
import { UndoHistory, type Undoable } from '../undo';
import { undoTargets } from '../undoTargets.svelte';
import { BARCODE_LABELS, encodeBarcode, IS_MATRIX, maxValueLength, SAMPLE_VALUES, type BarcodeOptions, type BarcodeType, type EncodeResult } from './index';
import type { BarcodeStyle } from './render';
import {
  BARCODE_KEY,
  loadBarcodeSettings,
  MATRIX_KEY,
  normalizeBarcodeOptions,
  normalizeBarcodeOutput,
  normalizeBarcodeStyle,
  type BarcodeOutput,
  type BarcodeSettings,
} from './settings';

interface Snapshot {
  settings: BarcodeSettings;
  value: string;
}

/** State of one generator tab: the linear barcodes, or Data Matrix. */
export class BarcodeState implements Undoable {
  settings: BarcodeSettings;
  value = $state('');
  result: EncodeResult;
  canUndo = $state(false);
  canRedo = $state(false);
  private history = new UndoHistory<Snapshot>();

  constructor(
    private key: string,
    /** Symbologies offered by this generator, the first being the default. */
    readonly types: readonly BarcodeType[],
    private styleDefaults: Partial<BarcodeStyle> = {},
  ) {
    this.settings = $state(loadBarcodeSettings(loadJson(key), types, styleDefaults));
    this.result = $derived(encodeBarcode(this.settings.type, this.value, this.settings.options));
    this.value = SAMPLE_VALUES[this.settings.type];
  }

  persist(): void {
    saveJson(this.key, this.settings);
  }

  private snapshot(): Snapshot {
    return { settings: $state.snapshot(this.settings), value: this.value };
  }

  private checkpoint(key: string): void {
    this.history.record(this.snapshot(), key);
    this.syncUndo();
  }

  private syncUndo(): void {
    this.canUndo = this.history.canUndo;
    this.canRedo = this.history.canRedo;
  }

  private apply(s: Snapshot | null): void {
    if (!s) return;
    // The typed data is the input's own business; it only comes back with a change of symbology
    // (which may have swapped in a sample).
    if (s.settings.type !== this.settings.type) this.value = s.value;
    this.settings.type = s.settings.type;
    this.settings.options = s.settings.options;
    this.settings.style = s.settings.style;
    this.settings.output = s.settings.output;
    this.persist();
    this.syncUndo();
  }

  undo(): void {
    this.apply(this.history.undo(this.snapshot()));
  }

  redo(): void {
    this.apply(this.history.redo(this.snapshot()));
  }

  setType(type: BarcodeType): void {
    const prev = this.settings.type;
    if (type === prev || !this.types.includes(type)) return;
    this.checkpoint('type');
    this.settings.type = type;
    // Keep the user's value unless it was the previous sample, is too long for the new type's
    // field, or cannot be encoded any more.
    if (
      this.value === SAMPLE_VALUES[prev] ||
      this.value.length > maxValueLength(type) ||
      !encodeBarcode(type, this.value, this.settings.options).ok
    ) {
      this.value = SAMPLE_VALUES[type];
    }
    // ITF-14 is normally printed with a bearer frame.
    if (type === 'itf14' && this.settings.style.bearer === 'none') this.settings.style.bearer = 'frame';
    else if (prev === 'itf14' && this.settings.style.bearer === 'frame') this.settings.style.bearer = 'none';
    this.persist();
  }

  updateOptions(patch: Partial<BarcodeOptions>): void {
    this.checkpoint(`options:${Object.keys(patch).sort().join(',')}`);
    this.settings.options = normalizeBarcodeOptions({ ...this.settings.options, ...patch });
    this.persist();
  }

  updateStyle(patch: Partial<BarcodeStyle>): void {
    this.checkpoint(`style:${Object.keys(patch).sort().join(',')}`);
    this.settings.style = normalizeBarcodeStyle({ ...this.settings.style, ...patch });
    this.persist();
  }

  updateOutput(patch: Partial<BarcodeOutput>): void {
    this.checkpoint(`output:${Object.keys(patch).sort().join(',')}`);
    this.settings.output = normalizeBarcodeOutput({ ...this.settings.output, ...patch });
    this.persist();
  }

  /** Restores a history entry; stored values are untrusted and pass through the normalizers. */
  restore(fields: Record<string, unknown>, options: unknown, style: unknown): void {
    const s = loadBarcodeSettings({ type: fields.type, options, style, output: this.settings.output }, this.types, this.styleDefaults);
    this.checkpoint('restore');
    this.settings.type = s.type;
    this.settings.options = s.options;
    this.settings.style = s.style;
    this.value = typeof fields.value === 'string' ? fields.value.slice(0, maxValueLength(s.type)) : '';
    this.persist();
  }
}

const ALL = Object.keys(BARCODE_LABELS) as BarcodeType[];

export const barcode = new BarcodeState(
  BARCODE_KEY,
  ALL.filter((t) => !IS_MATRIX.has(t)),
);
// Data Matrix is usually printed without a caption.
export const matrixCode = new BarcodeState(
  MATRIX_KEY,
  ALL.filter((t) => IS_MATRIX.has(t)),
  { showText: false },
);
undoTargets.barcode = barcode;
undoTargets.datamatrix = matrixCode;
