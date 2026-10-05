import type { StyleSettings } from '../settings';

/** One-click design templates. Every one keeps dark modules on a light background and reads back. */
export interface DesignTemplate {
  id: string;
  style: Partial<StyleSettings>;
}

const PLAIN: Partial<StyleSettings> = {
  fg: '#000000',
  bg: '#ffffff',
  transparent: false,
  moduleShape: 'square',
  finderOuter: 'square',
  finderInner: 'square',
  gradient: 'none',
  label: '',
};

export const DESIGN_TEMPLATES: readonly DesignTemplate[] = [
  { id: 'classic', style: { ...PLAIN } },
  { id: 'dots', style: { ...PLAIN, moduleShape: 'dot', finderOuter: 'circle', finderInner: 'circle' } },
  { id: 'soft', style: { ...PLAIN, moduleShape: 'rounded', finderOuter: 'rounded', finderInner: 'rounded' } },
  { id: 'night', style: { ...PLAIN, fg: '#1a237e', fg2: '#6a1b9a', gradient: 'linear', moduleShape: 'rounded', finderOuter: 'rounded', finderInner: 'rounded' } },
  { id: 'ocean', style: { ...PLAIN, fg: '#01579b', fg2: '#004d40', gradient: 'radial', moduleShape: 'dot', finderOuter: 'rounded', finderInner: 'circle' } },
  { id: 'forest', style: { ...PLAIN, fg: '#1b5e20', fg2: '#33691e', gradient: 'linear', moduleShape: 'rounded', finderOuter: 'square', finderInner: 'rounded' } },
  { id: 'crimson', style: { ...PLAIN, fg: '#8e0000', finderOuter: 'rounded', finderInner: 'square' } },
  { id: 'lines', style: { ...PLAIN, moduleShape: 'vertical', finderOuter: 'rounded', finderInner: 'rounded' } },
  { id: 'rows', style: { ...PLAIN, fg: '#263238', moduleShape: 'horizontal', finderOuter: 'rounded', finderInner: 'circle' } },
  { id: 'gem', style: { ...PLAIN, fg: '#4a148c', moduleShape: 'diamond', finderOuter: 'square', finderInner: 'circle' } },
  { id: 'scanMe', style: { ...PLAIN, label: 'SCAN ME', labelPosition: 'bottom', frameColor: '#000000', labelColor: '#ffffff', frameRadius: 2 } },
  { id: 'scanMeBlue', style: { ...PLAIN, fg: '#0d2a75', label: 'SCAN ME', labelPosition: 'bottom', frameColor: '#2657d9', labelColor: '#ffffff', frameRadius: 4, moduleShape: 'rounded', finderOuter: 'rounded', finderInner: 'rounded' } },
  { id: 'menu', style: { ...PLAIN, fg: '#3e2723', label: 'MENU', labelPosition: 'top', frameColor: '#3e2723', labelColor: '#fff8e1', frameRadius: 3, moduleShape: 'dot', finderOuter: 'rounded', finderInner: 'rounded' } },
];
