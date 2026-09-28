import { loadJson, saveJson } from '../storage/local';
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

/** State of one generator tab: the linear barcodes, or Data Matrix. */
export class BarcodeState {
  settings: BarcodeSettings;
  value = $state('');
  result: EncodeResult;

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

  setType(type: BarcodeType): void {
    const prev = this.settings.type;
    if (type === prev || !this.types.includes(type)) return;
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
    this.settings.options = normalizeBarcodeOptions({ ...this.settings.options, ...patch });
    this.persist();
  }

  updateStyle(patch: Partial<BarcodeStyle>): void {
    this.settings.style = normalizeBarcodeStyle({ ...this.settings.style, ...patch });
    this.persist();
  }

  updateOutput(patch: Partial<BarcodeOutput>): void {
    this.settings.output = normalizeBarcodeOutput({ ...this.settings.output, ...patch });
    this.persist();
  }

  /** Restores a history entry; stored values are untrusted and pass through the normalizers. */
  restore(fields: Record<string, unknown>, options: unknown, style: unknown): void {
    const s = loadBarcodeSettings({ type: fields.type, options, style, output: this.settings.output }, this.types, this.styleDefaults);
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
