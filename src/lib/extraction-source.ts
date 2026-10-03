import { z } from "zod";

export type ExtractionPage = { page: number; text: string };
export const normalizeSource = (value: string) =>
  value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
export const compactSource = (value: string) =>
  normalizeSource(value).replace(/[^\p{L}\p{N}]/gu, "");

export function invoiceIds(text: string) {
  return new Set(
    [
      ...text.matchAll(
        /\b(?:invoice\s*(?:no\.?|number)|bill of supply number)\s*[:#]?\s*([A-Z0-9][A-Z0-9/-]{5,})/gi,
      ),
    ]
      .map((match) => match[1]!.toUpperCase())
      .filter((id) => /\d/.test(id)),
  );
}

export function invoiceSource(
  rawText: string,
  pages: ExtractionPage[],
  selection: unknown,
) {
  const multipleInvoices = invoiceIds(rawText).size > 1;
  const selected = z
    .array(z.number().int().min(1).max(10))
    .min(1)
    .max(10)
    .safeParse(selection);
  if (!multipleInvoices)
    return { text: rawText, pages, multipleInvoices, ambiguous: false };
  const chosen = selected.success
    ? pages.filter((page) => selected.data.includes(page.page))
    : [];
  const text = chosen.map((page) => page.text).join("\n\n");
  const valid =
    selected.success &&
    new Set(selected.data).size === selected.data.length &&
    chosen.length === selected.data.length &&
    invoiceIds(text).size === 1;
  return {
    text: valid ? text : "",
    pages: valid ? chosen : [],
    multipleInvoices,
    ambiguous: !valid,
  };
}

export function checkedNameParts(value: string, quote: string, input: unknown) {
  const parsed = z
    .array(z.string().trim().min(2).max(160))
    .min(1)
    .max(6)
    .safeParse(input);
  if (!parsed.success || /\[Page \d+\]/i.test(quote)) return null;
  const parts = parsed.data;
  if (
    parts.join(" ").length > 160 ||
    compactSource(parts.join(" ")) !== compactSource(value)
  )
    return null;
  const source = normalizeSource(quote);
  let cursor = 0;
  for (const part of parts) {
    const token = normalizeSource(part);
    const index = source.indexOf(token, cursor);
    if (index < 0) return null;
    cursor = index + token.length;
  }
  return parts;
}

export function isProductName(value: string, text: string) {
  const name = normalizeSource(value);
  const occurrences = text
    .split(/\r?\n/)
    .filter((line) => normalizeSource(line).includes(name));
  const onlyPartyLabels =
    occurrences.length > 0 &&
    occurrences.every((line) => {
      const party = line.match(
        /^\s*(?:retailer|store|seller|merchant|sold by|buyer|customer)\s*[:#-]\s*(.+)$/i,
      );
      return party && normalizeSource(party[1]!) === name;
    });
  return (
    !onlyPartyLabels &&
    !/\b(?:qty|quantity)\b.*\b(?:total|amount|price|discount)\b/i.test(value) &&
    !/\b(?:unreadable|illegible|not readable)\b|^(?:unknown|n\/?a|none|not found|product description|item description)$/i.test(
      value.trim(),
    )
  );
}

export function hasSerialLabel(value: string, text: string) {
  const expression =
    /\b(?:serial\s*(?:number|no\.?)|s\/n|imei(?:\s*[12])?)\s*[:#]?[^\S\r\n]*([^\r\n]*)/gi;
  for (const match of text.matchAll(expression)) {
    let printed = match[1]!.trim();
    if (!printed)
      printed =
        text
          .slice(match.index! + match[0].length)
          .trimStart()
          .split(/\r?\n/)[0] ?? "";
    const source = normalizeSource(printed);
    const token = normalizeSource(value);
    if (
      source.startsWith(token) &&
      !/[\p{L}\p{N}-]/u.test(source.charAt(token.length))
    )
      return true;
  }
  return false;
}

export function nameRepairText(text: string, hint: unknown) {
  if (text.length <= 12_000) return text;
  const literalHint = typeof hint === "string" ? text.indexOf(hint) : -1;
  const header = text.search(
    /\b(?:product|item)\s*(?:description|name)|\bdescription\b/i,
  );
  const anchor = literalHint >= 0 ? literalHint : header;
  return anchor < 0
    ? null
    : text.slice(Math.max(0, anchor - 1000), anchor + 11_000);
}
