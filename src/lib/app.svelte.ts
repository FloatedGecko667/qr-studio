import { capacityRow } from './encoder/capacity';
import { symbolSpec } from './encoder/symbols';
import { normalizeOutput, normalizeStyle, normalizeSymbol, DEFAULT_QUIET_ZONE } from './normalize';
import { FORMS, restoreFields, type FormValues } from './payload/forms';
import type { PayloadKind } from './payload';
import { buildOptimized, type OptimizeSettings } from './optimize';
import { preparePayload, runPipeline, type PipelineResult } from './pipeline';
import { computeUsage, type Usage } from './usage';
import { loadJson, saveJson } from './storage/local';
import { UndoHistory, type Undoable } from './undo';
import { undoTargets } from './undoTargets.svelte';
import { loadSettings, SETTINGS_KEY, storedSettings, type OutputSettings, type Settings, type StyleSettings, type SymbolSettings } from './settings';

/** Largest binary upload: 16 structured-append symbols of version 40-L. */
export const MAX_BINARY_BYTES = (capacityRow(symbolSpec('model2', 40, 'L'), { structuredAppend: 16 }).byte ?? 0);

function initialFields(): Record<PayloadKind, FormValues> {
  return Object.fromEntries(Object.entries(FORMS).map(([k, f]) => [k, { ...f.defaults }])) as Record<PayloadKind, FormValues>;
}

/** What undo restores: the design-related settings and the logo, not the content being typed. */
interface QrSnapshot {
  symbol: SymbolSettings;
  style: StyleSettings;
  output: OutputSettings;
  optimize: OptimizeSettings;
  logo: string | null;
}

class AppState implements Undoable {
  settings: Settings = $state(loadSettings(loadJson(SETTINGS_KEY)));
  kind: PayloadKind = $state('url');
  fields: Record<PayloadKind, FormValues> = $state(initialFields());
  /** Sanitized PNG data URL; kept out of settings to keep localStorage small. */
  logoDataUrl: string | null = $state(null);
  fontDataUrl: string | null = $state(null);

  payload = $derived(buildOptimized(this.kind, this.fields[this.kind], this.settings.optimize));
  pipeline: PipelineResult = $derived(runPipeline(this.payload, this.settings.symbol));
  usage: Usage | null = $derived.by(() => {
    const prepared = preparePayload(this.payload, this.settings.symbol);
    if (!prepared || prepared === 'charset' || prepared.units.length === 0) return null;
    const chars = this.payload.text === undefined ? null : Array.from(this.payload.text).length;
    return computeUsage(prepared, this.settings.symbol, this.pipeline, chars);
  });
  /** Structured-append count actually in effect (resolves 'auto'). */
  appendCount: number = $derived(
    this.pipeline.status === 'ok'
      ? this.pipeline.result.symbols.length
      : this.settings.symbol.structuredAppend === 'auto'
        ? 1
        : this.settings.symbol.structuredAppend,
  );

  private history = new UndoHistory<QrSnapshot>();
  canUndo = $state(false);
  canRedo = $state(false);

  constructor() {
    this.settings.symbol = normalizeSymbol(this.settings.symbol);
    this.settings.style = normalizeStyle(this.settings.style);
    this.settings.output = normalizeOutput(this.settings.output);
  }

  persist(): void {
    saveJson(SETTINGS_KEY, storedSettings(this.settings));
  }

  private snapshot(): QrSnapshot {
    const { symbol, style, output, optimize } = $state.snapshot(this.settings);
    return { symbol, style, output, optimize, logo: this.logoDataUrl };
  }

  /** Call before changing a setting; `key` names the change so that drags merge into one step. */
  checkpoint(key: string): void {
    this.history.record(this.snapshot(), key);
    this.syncUndo();
  }

  private syncUndo(): void {
    this.canUndo = this.history.canUndo;
    this.canRedo = this.history.canRedo;
  }

  private apply(s: QrSnapshot | null): void {
    if (!s) return;
    this.settings.symbol = s.symbol;
    this.settings.style = s.style;
    this.settings.output = s.output;
    this.settings.optimize = s.optimize;
    this.logoDataUrl = s.logo;
    this.persist();
    this.syncUndo();
  }

  undo(): void {
    this.apply(this.history.undo(this.snapshot()));
  }

  redo(): void {
    this.apply(this.history.redo(this.snapshot()));
  }

  setLogo(dataUrl: string | null): void {
    this.checkpoint('logo');
    this.logoDataUrl = dataUrl;
  }

  /** Replaces the whole design (presets, design templates). */
  replaceStyle(style: StyleSettings, logo: string | null = this.logoDataUrl): void {
    this.checkpoint('replaceStyle');
    this.settings.style = normalizeStyle(style);
    this.logoDataUrl = logo;
    this.persist();
  }

  updateSymbol(patch: Partial<SymbolSettings>): void {
    this.checkpoint(`symbol:${Object.keys(patch).sort().join(',')}`);
    const prevType = this.settings.symbol.type;
    this.settings.symbol = normalizeSymbol({ ...this.settings.symbol, ...patch });
    const type = this.settings.symbol.type;
    if (type !== prevType && this.settings.style.quietZone === DEFAULT_QUIET_ZONE[prevType]) {
      this.settings.style.quietZone = DEFAULT_QUIET_ZONE[type];
    }
    this.persist();
  }

  updateStyle(patch: Partial<StyleSettings>): void {
    this.checkpoint(`style:${Object.keys(patch).sort().join(',')}`);
    this.settings.style = normalizeStyle({ ...this.settings.style, ...patch });
    this.persist();
  }

  updateOutput(patch: Partial<OutputSettings>): void {
    this.checkpoint(`output:${Object.keys(patch).sort().join(',')}`);
    this.settings.output = normalizeOutput({ ...this.settings.output, ...patch });
    this.persist();
  }

  updateOptimize(patch: Partial<OptimizeSettings>): void {
    this.checkpoint(`optimize:${Object.keys(patch).sort().join(',')}`);
    this.settings.optimize = { ...this.settings.optimize, ...patch };
    this.persist();
  }

  setField(key: string, value: FormValues[string]): void {
    this.fields[this.kind][key] = value;
  }

  restore(kind: PayloadKind, fields: Record<string, unknown>, symbol: unknown, style: unknown, logo: string | null): void {
    this.checkpoint('restore');
    this.kind = kind;
    this.fields[kind] = restoreFields(kind, fields);
    this.settings.symbol = normalizeSymbol({ ...this.settings.symbol, ...(symbol as object) });
    this.settings.style = normalizeStyle({ ...this.settings.style, ...(style as object) });
    this.logoDataUrl = logo;
    this.persist();
  }
}

export const app = new AppState();
undoTargets.qr = app;
