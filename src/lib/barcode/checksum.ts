/** GS1 mod 10 (weights 3,1 from the right) — EAN/UPC/ITF-14/GTIN. `body` excludes the check digit. */
export function gs1CheckDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum += Number(body[body.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10;
}

/** Luhn mod 10 as used by MSI. */
export function luhnCheckDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    let d = Number(body[body.length - 1 - i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return (10 - (sum % 10)) % 10;
}

/** MSI mod 11 (IBM weights 2..7 from the right). A result of 10 is encoded as "10". */
export function msiMod11(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum += Number(body[body.length - 1 - i]) * ((i % 6) + 2);
  const c = (11 - (sum % 11)) % 11;
  return String(c);
}

/** Strips spaces and hyphens that people type into numbers ("978-4-...", "4901 2345"). */
export function digitsOnly(value: string): string {
  return value
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[\s\-‐－ー]/g, '');
}
