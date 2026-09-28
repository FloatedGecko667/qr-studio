/** Module grid with a parallel map of function-pattern (non-data) modules. */
export class Matrix {
  readonly modules: Uint8Array;
  readonly isFunction: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.modules = new Uint8Array(width * height);
    this.isFunction = new Uint8Array(width * height);
  }

  get(x: number, y: number): boolean {
    return this.modules[y * this.width + x] === 1;
  }

  /** Sets a function-pattern module. */
  setFunction(x: number, y: number, dark: boolean): void {
    const i = y * this.width + x;
    this.modules[i] = dark ? 1 : 0;
    this.isFunction[i] = 1;
  }

  isFn(x: number, y: number): boolean {
    return this.isFunction[y * this.width + x] === 1;
  }

  clone(): Matrix {
    const m = new Matrix(this.width, this.height);
    m.modules.set(this.modules);
    m.isFunction.set(this.isFunction);
    return m;
  }

  /** XORs data modules where `pred(x, y)` is true. */
  applyMask(pred: (x: number, y: number) => boolean): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const i = y * this.width + x;
        if (!this.isFunction[i] && pred(x, y)) this.modules[i] ^= 1;
      }
    }
  }

  /**
   * Places `bits` into data modules using the two-column zigzag, starting at column
   * `startX` and moving left. `skipColumn` is the timing column Model 2 jumps over.
   */
  placeZigzag(bits: ArrayLike<number>, startX: number, skipColumn = -1): void {
    let i = 0;
    let upward = true;
    for (let right = startX; right >= 1; right -= 2) {
      if (right === skipColumn) right--;
      for (let row = 0; row < this.height; row++) {
        const y = upward ? this.height - 1 - row : row;
        for (let dx = 0; dx < 2; dx++) {
          const x = right - dx;
          if (this.isFn(x, y)) continue;
          this.modules[y * this.width + x] = i < bits.length ? bits[i] : 0;
          i++;
        }
      }
      upward = !upward;
    }
  }
}

/** Standard QR mask predicates (ISO/IEC 18004 Table 10); x = column, y = row. */
export const MASKS: readonly ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** BCH(15,5) code used by Model 2 and Micro QR format information. */
export function bchFormat(data5: number): number {
  let rem = data5;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return (data5 << 10) | rem;
}
