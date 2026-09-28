import { capacityRow } from './encoder/capacity';
import { symbolSpec } from './encoder/symbols';
import { normalizeOutput, normalizeStyle, normalizeSymbol, DEFAULT_QUIET_ZONE } from './normalize';
import { FORMS, restoreFields, type FormValues } from './payload/forms';
import type { PayloadKind } from './payload';
import { runPipeline, type PipelineResult } from './pipeline';
import { loadJson, saveJson } from './storage/local';
import { loadSettings, SETTINGS_KEY, type OutputSettings, type Settings, type StyleSettings, type SymbolSettings } from './settings';

/** Largest binary upload: 16 structured-append symbols of version 40-L. */
export const MAX_BINARY_BYTES = (capacityRow(symbolSpec('model2', 40, 'L'), { structuredAppend: 16 }).byte ?? 0);

function initialFields(): Record<PayloadKind, FormValues> {
  return Object.fromEntries(Object.entries(FORMS).map(([k, f]) => [k, { ...f.defaults }])) as Record<PayloadKind, FormValues>;
}

class AppState {
  settings: Settings = $state(loadSettings(loadJson(SETTINGS_KEY)));
  kind: PayloadKind = $state('url');
  fields: Record<PayloadKind, FormValues> = $state(initialFields());
  /** Sanitized PNG data URL; kept out of settings to keep localStorage small. */
  logoDataUrl: string | null = $state(null);
  fontDataUrl: string | null = $state(null);

  payload = $derived(FORMS[this.kind].build(this.fields[this.kind]));
  pipeline: PipelineResult = $derived(runPipeline(this.payload, this.settings.symbol));

  constructor() {
    this.settings.symbol = normalizeSymbol(this.settings.symbol);
    this.settings.style = normalizeStyle(this.settings.style);
    this.settings.output = normalizeOutput(this.settings.output);
  }

  persist(): void {
    saveJson(SETTINGS_KEY, this.settings);
  }

  updateSymbol(patch: Partial<SymbolSettings>): void {
    const prevType = this.settings.symbol.type;
    this.settings.symbol = normalizeSymbol({ ...this.settings.symbol, ...patch });
    const type = this.settings.symbol.type;
    if (type !== prevType && this.settings.style.quietZone === DEFAULT_QUIET_ZONE[prevType]) {
      this.settings.style.quietZone = DEFAULT_QUIET_ZONE[type];
    }
    this.persist();
  }

  updateStyle(patch: Partial<StyleSettings>): void {
    this.settings.style = normalizeStyle({ ...this.settings.style, ...patch });
    this.persist();
  }

  updateOutput(patch: Partial<OutputSettings>): void {
    this.settings.output = normalizeOutput({ ...this.settings.output, ...patch });
    this.persist();
  }

  setField(key: string, value: FormValues[string]): void {
    this.fields[this.kind][key] = value;
  }

  restore(kind: PayloadKind, fields: Record<string, unknown>, symbol: unknown, style: unknown, logo: string | null): void {
    this.kind = kind;
    this.fields[kind] = restoreFields(kind, fields);
    this.settings.symbol = normalizeSymbol({ ...this.settings.symbol, ...(symbol as object) });
    this.settings.style = normalizeStyle({ ...this.settings.style, ...(style as object) });
    this.logoDataUrl = logo;
    this.persist();
  }
}

export const app = new AppState();
