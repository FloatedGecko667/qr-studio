// Reed-Solomon error correction over GF(2^8) with the QR primitive polynomial 0x11D.

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}

export function gfMul(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]];
}

const divisorCache = new Map<number, Uint8Array>();

/** Generator polynomial coefficients (highest degree first, leading 1 omitted). */
function divisor(degree: number): Uint8Array {
  const cached = divisorCache.get(degree);
  if (cached) return cached;
  const result = new Uint8Array(degree);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 2);
  }
  divisorCache.set(degree, result);
  return result;
}

/** Computes `degree` error correction codewords for `data`. */
export function rsEncode(data: ArrayLike<number>, degree: number): Uint8Array {
  const div = divisor(degree);
  const rem = new Uint8Array(degree);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ rem[0];
    rem.copyWithin(0, 1);
    rem[degree - 1] = 0;
    for (let j = 0; j < degree; j++) rem[j] ^= gfMul(div[j], factor);
  }
  return rem;
}
