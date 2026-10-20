import { normalizeSource } from "./extraction-source";
import { findReceiptDates } from "./receipt-dates";

type Role =
  | "invoiceNumber"
  | "serialNumber"
  | "modelNumber"
  | "barcode"
  | "retailer"
  | "brand"
  | "purchaseDate"
  | "warrantyExpiresAt"
  | "returnExpiresAt"
  | "warrantyMonths"
  | "returnWindowDays"
  | "purchasePrice"
  | "other";

const definitions: { pattern: string; role: Role; priority?: number }[] = [
  {
    pattern:
      "(?:grand\\s+total|net\\s+payable|total\\s+payable|invoice\\s+(?:total|value)|bill\\s+total|total\\s+[aà]\\s+payer)",
    role: "purchasePrice",
    priority: 4,
  },
  {
    pattern:
      "(?:total\\s+amount(?:\\s+paid)?|amount\\s+paid|net\\s+amount|pay[ée])",
    role: "purchasePrice",
    priority: 3,
  },
  { pattern: "(?:total|amount\\s+due)", role: "purchasePrice", priority: 1 },
  {
    pattern:
      "(?:(?:total\\s+)?(?:change|kembali(?:an)?)|cash(?:\\s+(?:tendered|received|payment|amount))?|tunai|tendered|(?:credit|debit)\\s+card|card\\s+(?:paid|payment|amount)|visa|mastercard|upi|deposit|advance|outstanding|balance(?:\\s+due)?|total\\s+(?:items?|quantity|qty))",
    role: "other",
  },
  {
    pattern:
      "(?:sub\\s*total|mrp|list\\s+price|unit\\s+price|rate|discount|tax(?:able\\s+(?:amount|value))?|[sic]gst|cess|balance|quantity|qty|hsn|sac)",
    role: "other",
  },
  {
    pattern:
      "(?:purchase\\s+date|date\\s+of\\s+purchase|invoice\\s+date|bill\\s+date|receipt\\s+date)",
    role: "purchaseDate",
    priority: 2,
  },
  {
    pattern:
      "(?:(?:delivery|dispatch|shipping|shipped|order|due|payment|manufactur(?:e|ed|ing)|mfg\\.?|expiry|expiration)\\s+date|date\\s+(?:of\\s+(?:order|manufactur(?:e|ing)|birth)|due)|birth\\s+date|dob)",
    role: "other",
  },
  {
    pattern:
      "warranty\\s+(?:expires(?:\\s+at)?|end(?:\\s+date)?|expiry(?:\\s+date)?)",
    role: "warrantyExpiresAt",
  },
  {
    pattern: "return\\s+(?:by|deadline|expiry(?:\\s+date)?|end\\s+date)",
    role: "returnExpiresAt",
  },
  { pattern: "date", role: "purchaseDate", priority: 1 },
  {
    pattern:
      "(?:invoice|receipt|bill)(?:\\s*(?:no\\.?|number|id))?|bill\\s+of\\s+supply\\s+number",
    role: "invoiceNumber",
  },
  {
    pattern: "(?:serial(?:\\s*(?:number|no\\.?))?|s/n|imei(?:\\s*[12])?)",
    role: "serialNumber",
  },
  {
    pattern: "model(?:\\s*(?:name|number|no\\.?))?",
    role: "modelNumber",
  },
  { pattern: "(?:barcode|ean|upc|gtin)", role: "barcode" },
  {
    pattern:
      "(?:order(?:\\s*(?:number|no\\.?|id))?|gst(?:in|\\s*(?:number|no\\.?))?|pan|sku|customer\\s+id|reference(?:\\s*(?:number|no\\.?|id))?)",
    role: "other",
  },
  {
    pattern: "brand(?:\\s+name)?",
    role: "brand",
    priority: 2,
  },
  {
    pattern: "(?:manufacturer(?:\\s+name)?|manufactured\\s+by|mfr)",
    role: "brand",
  },
  {
    pattern: "(?:retailer|store|seller|merchant|sold\\s+by)",
    role: "retailer",
  },
  {
    pattern: "(?:buyer|customer|bill(?:ed)?\\s+to|ship(?:ped)?\\s+to)",
    role: "other",
  },
  {
    pattern: "warranty(?:\\s+(?:period|duration))?",
    role: "warrantyMonths",
  },
  { pattern: "return\\s+(?:window|period)", role: "returnWindowDays" },
];

const expressions = definitions.map((definition) => ({
  ...definition,
  expression: new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${definition.pattern})(?![\\p{L}\\p{N}])[ \\t:#.]*`,
    "giu",
  ),
}));

function labels(line: string) {
  const candidates = expressions.flatMap(({ expression, role, priority }) =>
    [...line.matchAll(expression)]
      .filter((match) => {
        if (role !== "brand") return true;
        const prefix = line.slice(0, match.index);
        // Maker words inside product prose are not field labels.
        return (
          !prefix.trim() ||
          /(?:\t[ \t]*|\|[ \t]*| {2,})$/.test(prefix) ||
          /[:#]/.test(match[0])
        );
      })
      .map((match) => ({
        role,
        priority: priority ?? 1,
        index: match.index,
        end: match.index + match[0].length,
      })),
  );
  const selected: typeof candidates = [];
  for (const candidate of candidates.sort(
    (a, b) => a.index - b.index || b.end - a.end,
  )) {
    if (!selected.some((label) => candidate.index < label.end))
      selected.push(candidate);
  }
  return selected;
}

/** Preserve monetary label boundaries before parsing a cell's whole value. */
export function receiptAmountCells(text: string) {
  return text.split(/\r?\n/).flatMap((line, lineIndex, lines) => {
    const rowLabels = labels(line);
    return rowLabels.flatMap((label, labelIndex) => {
      const printed = line.slice(label.index, label.end).trim();
      const role =
        label.role === "purchasePrice"
          ? "purchasePrice"
          : /^(?:total\s+)?(?:change|kembali(?:an)?)\b/i.test(printed)
            ? "change"
            : /^(?:cash|tunai|tendered)\b/i.test(printed)
              ? "cash"
              : /^(?:(?:credit|debit)\s+card|card|visa|mastercard|upi|deposit|advance|outstanding|balance)\b/i.test(
                    printed,
                  )
                ? "otherTender"
                : null;
      if (!role) return [];
      // Words inside a product description are not a summary-row label.
      if (
        label.index > 0 &&
        !/(?:\t|\|| {2,})\s*$/.test(line.slice(0, label.index)) &&
        !rowLabels.some((previous) => previous.end <= label.index) &&
        !/^\s*\d+\s+(?:articles?|article\(s\)|items?|item\(s\))\s*$/i.test(
          line.slice(0, label.index),
        )
      )
        return [];
      let raw = line.slice(label.end, rowLabels[labelIndex + 1]?.index).trim();
      let quote = line.trim();
      if (!raw && rowLabels.length === 1) {
        let nextIndex = lineIndex + 1;
        while (nextIndex <= lineIndex + 3 && lines[nextIndex]?.trim() === "")
          nextIndex++;
        const next = lines[nextIndex]?.trim();
        if (nextIndex <= lineIndex + 3 && next && !labels(next).length) {
          raw = next;
          quote += `\n${lines.slice(lineIndex + 1, nextIndex + 1).join("\n")}`;
        }
      }
      return [{ role, raw, priority: label.priority, quote }];
    });
  });
}

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function occurrences(value: string, text: string) {
  const token = value.normalize("NFKC").trim();
  if (!token) return [];
  const expression = new RegExp(escape(token).replace(/\s+/g, "\\s+"), "giu");
  const lines = text.normalize("NFKC").split(/\r?\n/);
  return lines.flatMap((line, lineIndex) =>
    [...line.matchAll(expression)]
      .filter((match) => {
        const before = line.charAt(match.index - 1);
        const after = line.charAt(match.index + match[0].length);
        const crossesAnotherLabel = labels(line).some(
          (label) =>
            label.index > match.index &&
            label.index < match.index + match[0].length &&
            /[:#]/.test(line.slice(label.index, label.end)),
        );
        return !/[\p{L}\p{N}]/u.test(before + after) && !crossesAnotherLabel;
      })
      .map((match) => {
        const preceding = labels(line).filter(
          (label) => label.end <= match.index,
        );
        let label = preceding.at(-1);
        if (!label && lineIndex > 0) {
          let previousIndex = lineIndex - 1;
          while (
            previousIndex >= Math.max(0, lineIndex - 3) &&
            !lines[previousIndex]!.trim()
          )
            previousIndex--;
          const previous = lines[previousIndex] ?? "";
          const previousLabels = labels(previous);
          const only = previousLabels[0];
          if (
            previousLabels.length === 1 &&
            only &&
            (previousIndex === lineIndex - 1 ||
              only.role === "purchasePrice") &&
            !previous.slice(only.end).trim() &&
            // A document title such as "Tax Invoice" is not an ID label.
            (only.index === 0 ||
              /[:#]\s*$/.test(previous) ||
              (only.role === "purchasePrice" &&
                /^\s*\d+\s+(?:articles?|article\(s\)|items?|item\(s\))\s*$/i.test(
                  previous.slice(0, only.index),
                )))
          )
            label = only;
        }
        return { label, line };
      }),
  );
}

/** Verify what a printed token means, not just whether it occurs somewhere. */
export function supportsFieldRole(
  role: Role,
  token: string,
  text: string,
  quote?: string,
) {
  if (quote) {
    const quoted = occurrences(token, quote);
    if (
      quoted.some(({ label }) => label) &&
      !quoted.some(({ label }) => label?.role === role)
    )
      return false;
  }
  const matches = occurrences(token, text);
  if (
    role === "purchaseDate" &&
    !text
      .split(/\r?\n/)
      .some((line) =>
        labels(line).some(
          (label) =>
            label.role === "purchaseDate" ||
            (label.role === "other" &&
              /\b(?:date|dob)\b/i.test(line.slice(label.index, label.end))),
        ),
      )
  ) {
    const validDates = findReceiptDates(text);
    const distinct = new Set(validDates.map(({ value }) => value));
    const requested = findReceiptDates(token)[0];
    if (requested && distinct.size === 1 && distinct.has(requested.value))
      return matches.some(({ label, line }) => {
        if (label) return false;
        // Timestamped sale headers and date-only rows are useful even without
        // "Date:". URLs, customer DOB and incidental footer dates are not.
        if (
          /https?:|www\.|\b(?:birth|dob|order|delivery|shipping|due|expir|manufactur)/i.test(
            line,
          )
        )
          return false;
        const dateIndex = line.indexOf(token);
        const prefix = line.slice(0, dateIndex);
        const suffix = line.slice(dateIndex + token.length).trim();
        const timestamp =
          /^(?:[01]?\d|2[0-3])(?::[0-5]\d(?::[0-5]\d)?|h[0-5]\d)(?:\s*[ap]m)?$/i.test(
            suffix,
          );
        const terminalReferences = /^\d{1,12}(?:[ \t]+\d{1,12}){0,3}$/.test(
          prefix.trim(),
        );
        const separateCell =
          prefix.length <= 180 && /(?:\t| {2,})$/.test(prefix);
        return (
          (!prefix.trim() && !suffix) ||
          (timestamp && (!prefix.trim() || terminalReferences || separateCell))
        );
      });
  }
  const preferred = Math.max(
    1,
    ...text.split(/\r?\n/).flatMap((line) =>
      labels(line)
        .filter((label) => label.role === role)
        .map((label) => label.priority),
    ),
  );
  return matches.some(
    ({ label }) => label?.role === role && label.priority >= preferred,
  );
}

export function supportsRetailer(value: string, text: string) {
  const matches = occurrences(value, text);
  return matches.some(({ label }) => !label || label.role === "retailer");
}

export function supportsProductToken(token: string, description: string) {
  // Text after compatibility language describes another product, not its maker.
  const ownDescription = description.split(
    /\b(?:for|compatible\s+with|fits|suitable\s+for|designed\s+for|works\s+with|replacement\s+for|use\s+with)\b/i,
  )[0]!;
  return occurrences(token, ownDescription).length > 0;
}

export function supportsBrand(
  brand: string,
  text: string,
  productName: string,
) {
  return (
    supportsFieldRole("brand", brand, text) ||
    (Boolean(productName) && supportsProductToken(brand, productName))
  );
}

/** Recover only a unique, explicitly printed maker; never guess from known brands. */
export function recoverLabeledBrand(text: string) {
  const found = text.split(/\r?\n/).flatMap((line, index, lines) => {
    const lineLabels = labels(line);
    return lineLabels.flatMap((label, labelIndex) => {
      if (label.role !== "brand") return [];
      const next = lineLabels[labelIndex + 1];
      let value = line.slice(label.end, next?.index).trim();
      let quote = line.trim();
      if (!value && label.index === 0 && lineLabels.length === 1) {
        const following = lines[index + 1]?.trim();
        if (following && !labels(following).length) {
          value = following;
          quote += `\n${following}`;
        }
      }
      if (
        !value ||
        value.length > 120 ||
        !/\p{L}/u.test(value) ||
        /^(?:unknown|n\/?a|none|not\s+(?:found|available)|unreadable|illegible)$/i.test(
          value,
        )
      )
        return [];
      return [{ value, quote, priority: label.priority }];
    });
  });
  const preferred = Math.max(0, ...found.map(({ priority }) => priority));
  const candidates = found.filter(({ priority }) => priority === preferred);
  const distinct = new Set(
    candidates.map(({ value }) => normalizeSource(value)),
  );
  const first = candidates[0];
  return distinct.size === 1 && first
    ? { value: first.value, quote: first.quote }
    : null;
}
