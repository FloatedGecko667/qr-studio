// Rule of thumb used by QR guides: a code can be read from about ten times its width.

/** Recommended symbol width (without quiet zone) in mm for a reading distance in metres. */
export function symbolMmForDistance(distanceM: number): number {
  return Math.round(distanceM * 100);
}

/**
 * Output size (the whole image, quiet zone and frame included) in mm for a reading distance,
 * and the resulting module size.
 */
export function outputForDistance(distanceM: number, symbolModules: number, totalUnits: number): { sizeMm: number; moduleMm: number } {
  const symbolMm = symbolMmForDistance(distanceM);
  const moduleMm = symbolMm / symbolModules;
  return { sizeMm: Math.round(moduleMm * totalUnits * 10) / 10, moduleMm };
}
