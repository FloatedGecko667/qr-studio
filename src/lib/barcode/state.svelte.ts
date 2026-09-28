import { loadJson, saveJson } from '../storage/local';
import { encodeBarcode, SAMPLE_VALUES, type BarcodeOptions, type BarcodeType, type EncodeResult } from './index';
import type { BarcodeStyle } from './render';
import {
  BARCODE_KEY,
  loadBarcodeSettings,
  normalizeBarcodeOptions,
  normalizeBarcodeOutput,
  normalizeBarcodeStyle,
  type BarcodeOutput,
  type BarcodeSettings,
} from './settings';

class BarcodeState {
  settings: BarcodeSettings = $state(loadBarcodeSettings(loadJson(BARCODE_KEY)));
  value = $state('');
  result: EncodeResult = $derived(encodeBarcode(this.settings.type, this.value, this.settings.options));

  constructor() {
    this.value = SAMPLE_VALUES[this.settings.type];
  }

  persist(): void {
    saveJson(BARCODE_KEY, this.settings);
  }

  setType(type: BarcodeType): void {
    const prev = this.settings.type;
    if (type === prev) return;
    this.settings.type = type;
    // Keep the user's value unless it was the previous sample or cannot be encoded any more.
    if (this.value === SAMPLE_VALUES[prev] || !encodeBarcode(type, this.value, this.settings.options).ok) {
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
}

export const barcode = new BarcodeState();
