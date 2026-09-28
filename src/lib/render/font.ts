import latinExtUrl from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-ext-wght-normal.woff2?url';
import latinUrl from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2?url';

import { FONT_FAMILY } from './fontName';

export { FONT_FAMILY };

// Ranges copied from @fontsource-variable/jetbrains-mono/wght.css (latin, latin-ext).
const LATIN =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const LATIN_EXT =
  'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';

export function registerFonts(): void {
  const faces = [
    new FontFace(FONT_FAMILY, `url(${latinUrl}) format("woff2")`, { weight: '100 800', unicodeRange: LATIN, display: 'swap' }),
    new FontFace(FONT_FAMILY, `url(${latinExtUrl}) format("woff2")`, { weight: '100 800', unicodeRange: LATIN_EXT, display: 'swap' }),
  ];
  for (const f of faces) document.fonts.add(f);
}

let dataUrl: Promise<string> | null = null;

/** Latin subset as a data URL, for embedding into exported SVG. */
export function fontDataUrl(): Promise<string> {
  dataUrl ??= fetch(latinUrl)
    .then((r) => r.blob())
    .then(
      (b) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).replace(/^data:[^;]*;/, 'data:font/woff2;'));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(b);
        }),
    );
  return dataUrl;
}

export async function fontsReady(): Promise<void> {
  await document.fonts.load(`700 16px "${FONT_FAMILY}"`);
}
