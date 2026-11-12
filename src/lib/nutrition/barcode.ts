// Food barcodes: EAN-13, EAN-8, UPC-A and UPC-E. Pure; runs on the device and the server.
// Every barcode ends in a check digit, so a mistyped or misread number is caught before any lookup.

export type BarcodeFormat = "ean13" | "ean8" | "upca" | "upce";
export type ParsedBarcode = { ok: true; format: BarcodeFormat; code: string; lookup: string } | { ok: false; error: string };

/** GS1 check digit for the digits before it (weights 3,1,3,1… from the right). */
export function checkDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum += Number(body[body.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10;
}
const valid = (code: string) => checkDigit(code.slice(0, -1)) === Number(code.slice(-1));

/** Expands an 8-digit UPC-E (number system, 6 digits, check digit) to its 12-digit UPC-A form, or null. */
export function upceToUpca(code: string): string | null {
  if (!/^[01]\d{7}$/.test(code)) return null;
  const [ns, d1, d2, d3, d4, d5, d6, check] = code.split("");
  const body =
    "012".includes(d6) ? `${d1}${d2}${d6}0000${d3}${d4}${d5}`
    : d6 === "3" ? `${d1}${d2}${d3}00000${d4}${d5}`
    : d6 === "4" ? `${d1}${d2}${d3}${d4}00000${d5}`
    : `${d1}${d2}${d3}${d4}${d5}0000${d6}`;
  return `${ns}${body}${check}`;
}

/**
 * Checks a typed or scanned barcode. `lookup` is the form used for product lookups and caching:
 * 13 digits for EAN-13, UPC-A (with a leading 0) and UPC-E (expanded); 8 digits for EAN-8.
 * `hint` is the format a camera scanner reported, which settles the EAN-8 / UPC-E ambiguity.
 */
export function parseBarcode(input: string, hint?: BarcodeFormat): ParsedBarcode {
  const code = String(input ?? "").replace(/[\s-]/g, "");
  if (!/^\d+$/.test(code)) return { ok: false, error: "A barcode has only numbers. Check it and try again." };
  const bad: ParsedBarcode = { ok: false, error: "That number doesn't look right. Check the digits under the barcode." };
  if (code.length === 13) return valid(code) ? { ok: true, format: "ean13", code, lookup: code } : bad;
  if (code.length === 12) return valid(code) ? { ok: true, format: "upca", code, lookup: `0${code}` } : bad;
  if (code.length === 8) {
    const upca = upceToUpca(code);
    const asUpce: ParsedBarcode | null = upca && valid(upca) ? { ok: true, format: "upce", code, lookup: `0${upca}` } : null;
    const asEan8: ParsedBarcode | null = valid(code) ? { ok: true, format: "ean8", code, lookup: code } : null;
    return (hint === "upce" ? asUpce ?? asEan8 : asEan8 ?? asUpce) ?? bad;
  }
  return { ok: false, error: "Food barcodes have 8, 12 or 13 digits." };
}
