/** Append-only bit sequence, most significant bit first. */
export class BitBuffer {
  readonly bits: number[] = [];

  get length(): number {
    return this.bits.length;
  }

  push(value: number, length: number): void {
    for (let i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  }

  append(other: BitBuffer): void {
    for (const b of other.bits) this.bits.push(b);
  }
}
