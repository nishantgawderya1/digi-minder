import {
  receiptAmountCells,
  supportsFieldRole,
} from "./extraction-field-evidence";

/** Parse one printed monetary cell, never a partial number or a list of columns. */
export function parseReceiptAmount(raw: string, contextText: string) {
  const euroContext = /\bEUR\b|€/i.test(`${raw}\n${contextText}`);
  const amount = raw
    .normalize("NFKC")
    .trim()
    .replace(/^[=:]\s*/, "")
    .replace(/^\((INR|USD|EUR|GBP|IDR|MYR|SGD|AUD|CAD|AED|RM)\)\s*/i, "$1 ")
    .replace(
      /^(?:(?:INR|USD|EUR|GBP|IDR|MYR|SGD|AUD|CAD|AED|Rs\.?|Rp\.?|RM|US\$)\s*|[₹$€£]\s*)/i,
      "",
    )
    .replace(/\s*(?:INR|USD|EUR|GBP|IDR|MYR|SGD|AUD|CAD|AED|[₹$€£])$/i, "")
    .trim()
    // NVIDIA read the printed € as e on the real French grocery receipt.
    // Only repair this exact suffix when a separate EUR/€ cue confirms it.
    .replace(/(\d[.,]\d{2})e$/i, (printed, number: string) =>
      euroContext ? number : printed,
    );
  if (!/^\d+(?:[.,]\d+)*$/.test(amount)) return null;
  let normalized: string;
  if (/^\d+(?:\.\d{1,2})?$/.test(amount)) normalized = amount;
  else if (/^\d+,\d{1,2}$/.test(amount)) normalized = amount.replace(",", ".");
  else if (
    /^(?:\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})+,\d{3})(?:\.\d{1,2})?$/.test(
      amount,
    )
  )
    normalized = amount.replace(/,/g, "");
  else if (/^\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(amount))
    normalized = amount.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(?:\.\d{3})+$/.test(amount)) {
    // A single dot may be a decimal point. Require an actual locale cue before
    // interpreting 48.000 as 48000; USD/INR receipts must not silently grow 1000x.
    const context = `${raw}\n${contextText}`;
    const dotDecimalCurrency =
      /\b(?:USD|INR|GBP|MYR|SGD|AUD|CAD|AED)\b|[₹$£]/i.test(context);
    const dotGroupingContext =
      /\b(?:IDR|EUR|Rp\.?|rupiah|tunai|kembali(?:an)?)\b|€/i.test(context);
    if (
      dotDecimalCurrency ||
      (!dotGroupingContext && amount.split(".").length < 3)
    )
      return null;
    normalized = amount.replace(/\./g, "");
  } else return null;
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(normalized)) return null;
  return Number(normalized).toFixed(2);
}

function withoutItemCount(raw: string) {
  return raw
    .replace(/\(?\s*\d+(?:[.,]\d+)?\s*(?:items?|pcs?|pieces?)\s*\)?/gi, " ")
    .trim();
}

/** Confirm a unique final amount and reject contradictory tender/change rows. */
export function verifiedPurchaseAmount(
  value: string,
  quote: string,
  source: string,
) {
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(value)) return false;
  const expected = Number(value).toFixed(2);
  const cells = receiptAmountCells(source);
  const totals = cells.filter(({ role }) => role === "purchasePrice");
  const preferred = Math.max(0, ...totals.map(({ priority }) => priority));
  const preferredAmounts = totals
    .filter(({ priority }) => priority === preferred)
    .map(({ raw }) => parseReceiptAmount(withoutItemCount(raw), source));
  if (
    !preferredAmounts.length ||
    preferredAmounts.some((amount) => amount === null) ||
    new Set(preferredAmounts).size !== 1 ||
    preferredAmounts[0] !== expected
  )
    return false;

  // Cash tender must cover a full cash sale. Contradictions can reveal shifted
  // OCR rows: one real photo read Total 100000 / Cash 80000 instead of 20000.
  const amountsFor = (role: "cash" | "change" | "otherTender") =>
    cells
      .filter((cell) => cell.role === role)
      .flatMap(({ raw }) => {
        const amount = parseReceiptAmount(raw, source);
        return amount === null ? [] : [Number(amount)];
      });
  const cash = [...new Set(amountsFor("cash"))];
  const change = [...new Set(amountsFor("change"))];
  const otherTender = amountsFor("otherTender").some((amount) => amount > 0);
  if (cash.length === 1 && !otherTender) {
    if (cash[0]! < Number(expected)) return false;
    if (
      change.length === 1 &&
      Math.round((cash[0]! - change[0]!) * 100) !==
        Math.round(Number(expected) * 100)
    )
      return false;
  }

  // Quotes remain literal. Match complete source tokens so 48.000 cannot be
  // accepted as 48.00, and a quantity next to the total cannot become its price.
  const tokens =
    quote.match(/(?<![\p{L}\p{N}])\d+(?:[.,]\d+)*(?:e(?![\p{L}\p{N}]))?/giu) ??
    [];
  return tokens.some(
    (token) =>
      parseReceiptAmount(token, source) === expected &&
      supportsFieldRole("purchasePrice", token, source, quote),
  );
}

/** Recover a final total only when the same checks also validate AI suggestions. */
export function recoverPurchaseAmount(source: string) {
  const cells = receiptAmountCells(source).filter(
    ({ role }) => role === "purchasePrice",
  );
  const preferred = Math.max(0, ...cells.map(({ priority }) => priority));
  const candidates = cells
    .filter(({ priority }) => priority === preferred)
    .map((cell) => ({
      value: parseReceiptAmount(withoutItemCount(cell.raw), source),
      quote: cell.quote,
    }));
  const first = candidates[0];
  if (
    !first?.value ||
    candidates.some(({ value }) => value === null) ||
    new Set(candidates.map(({ value }) => value)).size !== 1 ||
    first.quote.length > 2500 ||
    !verifiedPurchaseAmount(first.value, first.quote, source)
  )
    return null;
  return { value: first.value, quote: first.quote };
}
