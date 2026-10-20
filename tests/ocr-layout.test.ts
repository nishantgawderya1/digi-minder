import { describe, expect, it } from "vitest";
import { reconstructOcrText } from "../src/lib/ocr-layout";

type Detection = Parameters<typeof reconstructOcrText>[0][number][number];

function rectangle(
  text: string,
  left: number,
  top: number,
  width = 60,
  height = 20,
): Detection {
  return {
    text,
    points: [
      { x: left, y: top },
      { x: left + width, y: top + height },
    ],
  };
}

function skewed(
  text: string,
  left: number,
  top: number,
  width = 60,
  height = 20,
  slope = -0.1,
): Detection {
  return {
    text,
    points: [
      { x: left, y: top + slope * left },
      { x: left + width, y: top + slope * (left + width) },
      { x: left + width, y: top + height + slope * (left + width) },
      { x: left, y: top + height + slope * left },
    ],
  };
}

// Real CORD v2 validation image 2: geometry and recognized characters only.
// Park et al., NAVER CLOVA; CC-BY-4.0:
// https://github.com/clovaai/cord
// https://huggingface.co/datasets/naver-clova-ix/cord-v2/viewer/default/validation?row=2
// These are official annotation quadrilaterals, NOT NVIDIA response boxes.
const cordTotals: Detection[] = [
  {
    text: "PB1:",
    points: [
      { x: 180, y: 439 },
      { x: 217, y: 437 },
      { x: 217, y: 456 },
      { x: 180, y: 458 },
    ],
  },
  {
    text: "1,818",
    points: [
      { x: 310, y: 425 },
      { x: 355, y: 421 },
      { x: 358, y: 444 },
      { x: 312, y: 449 },
    ],
  },
  {
    text: "Subtotal:",
    points: [
      { x: 141, y: 461 },
      { x: 216, y: 454 },
      { x: 217, y: 476 },
      { x: 143, y: 482 },
    ],
  },
  {
    text: "18,181",
    points: [
      { x: 304, y: 449 },
      { x: 356, y: 443 },
      { x: 360, y: 464 },
      { x: 305, y: 471 },
    ],
  },
  {
    text: "Total:",
    points: [
      { x: 166, y: 478 },
      { x: 219, y: 475 },
      { x: 220, y: 499 },
      { x: 167, y: 502 },
    ],
  },
  {
    text: "20,000",
    points: [
      { x: 305, y: 468 },
      { x: 360, y: 464 },
      { x: 363, y: 486 },
      { x: 307, y: 490 },
    ],
  },
  {
    text: "Cash:",
    points: [
      { x: 176, y: 499 },
      { x: 221, y: 495 },
      { x: 223, y: 517 },
      { x: 177, y: 521 },
    ],
  },
  {
    text: "100,000",
    points: [
      { x: 301, y: 489 },
      { x: 363, y: 484 },
      { x: 365, y: 505 },
      { x: 302, y: 513 },
    ],
  },
  {
    text: "CHANGE:",
    points: [
      { x: 162, y: 543 },
      { x: 225, y: 537 },
      { x: 226, y: 560 },
      { x: 162, y: 566 },
    ],
  },
  {
    text: "80,000",
    points: [
      { x: 312, y: 532 },
      { x: 368, y: 527 },
      { x: 370, y: 548 },
      { x: 312, y: 555 },
    ],
  },
];

describe("OCR reading layout", () => {
  it("corrects real photographed CORD total/cash rows using the text angle", () => {
    expect(reconstructOcrText([cordTotals])).toBe(
      "PB1:\t1,818\nSubtotal:\t18,181\nTotal:\t20,000\nCash:\t100,000\nCHANGE:\t80,000",
    );
  });

  it("shows why raw vertical proximity cannot safely pair the real CORD total", () => {
    const center = (word: Detection) => {
      const ys = word.points!.map((point) => point.y);
      return (Math.min(...ys) + Math.max(...ys)) / 2;
    };
    const label = cordTotals.find((word) => word.text === "Total:")!;
    const amounts = cordTotals.filter((word) => /^[\d,]+$/.test(word.text));
    const naiveNearest = amounts.sort(
      (a, b) =>
        Math.abs(center(a) - center(label)) -
        Math.abs(center(b) - center(label)),
    )[0];
    // On this photograph, the next row's cash is closer vertically than the
    // actual total. This demonstrates the geometry hazard, not an invented
    // NVIDIA payload or a claim about the old grouping on annotation boxes.
    expect(naiveNearest!.text).toBe("100,000");
    expect(reconstructOcrText([cordTotals])).toContain("Total:\t20,000");
  });

  it("uses the same real geometry when normalized to image coordinates", () => {
    const normalized = cordTotals.map((word) => ({
      ...word,
      // Uniform scaling preserves angles; providers may normalize both axes
      // by the image width or emit pixel coordinates.
      points: word.points!.map(({ x, y }) => ({ x: x / 740, y: y / 740 })),
    }));
    expect(reconstructOcrText([normalized])).toBe(
      reconstructOcrText([cordTotals]),
    );
  });

  it("supports independently normalized x/y axes", () => {
    const normalized = cordTotals.map((word) => ({
      ...word,
      points: word.points!.map(({ x, y }) => ({ x: x / 418, y: y / 740 })),
    }));
    expect(reconstructOcrText([normalized])).toBe(
      reconstructOcrText([cordTotals]),
    );
  });

  it("does not depend on OCR detection order or corner order", () => {
    const reordered = [...cordTotals].reverse().map((word) => ({
      ...word,
      points: [...word.points!].reverse(),
    }));
    expect(reconstructOcrText([reordered])).toBe(
      reconstructOcrText([cordTotals]),
    );
  });

  it("keeps flat receipt rows and explicit table columns", () => {
    expect(
      reconstructOcrText([
        [
          rectangle("Subtotal:", 10, 20, 80),
          rectangle("18,181", 300, 20),
          rectangle("Total:", 10, 50),
          rectangle("20,000", 300, 50),
          rectangle("Cash:", 10, 80),
          rectangle("100,000", 300, 80),
        ],
      ]),
    ).toBe("Subtotal:\t18,181\nTotal:\t20,000\nCash:\t100,000");
  });

  it("handles positive as well as negative page skew", () => {
    expect(
      reconstructOcrText([
        [
          skewed("Total:", 20, 100, 60, 20, 0.2),
          skewed("20,000", 300, 100, 70, 20, 0.2),
          skewed("Cash:", 20, 135, 60, 20, 0.2),
          skewed("100,000", 300, 135, 70, 20, 0.2),
        ],
      ]),
    ).toBe("Total:\t20,000\nCash:\t100,000");
  });

  it("uses the nearest eligible row rather than the first eligible row", () => {
    expect(
      reconstructOcrText([
        [
          rectangle("first", 10, 0, 50, 20),
          rectangle("second", 10, 8, 50, 20),
          rectangle("value", 200, 9, 50, 20),
        ],
      ]),
    ).toBe("first\nsecond\tvalue");
  });

  it("keeps tall headings from absorbing the next receipt row", () => {
    expect(
      reconstructOcrText([
        [
          rectangle("RECEIPT", 10, 0, 130, 44),
          rectangle("Total:", 10, 48, 60, 12),
          rectangle("20,000", 300, 48, 70, 12),
        ],
      ]),
    ).toBe("RECEIPT\nTotal:\t20,000");
  });

  it("allows a larger amount font on the same baseline", () => {
    expect(
      reconstructOcrText([
        [
          rectangle("Total:", 10, 48, 60, 12),
          rectangle("20,000", 300, 36, 80, 24),
          rectangle("Cash:", 10, 80, 60, 12),
          rectangle("100,000", 300, 80, 80, 12),
        ],
      ]),
    ).toBe("Total:\t20,000\nCash:\t100,000");
  });

  it("preserves words, Unicode and decimal separators exactly", () => {
    expect(
      reconstructOcrText([
        [
          rectangle("Total", 10, 0, 40, 12),
          rectangle("à payer", 54, 0, 55, 12),
          rectangle("12,50 €", 250, 0, 70, 12),
        ],
      ]),
    ).toBe("Total à payer\t12,50 €");
  });

  it("never combines rows from separate pages", () => {
    expect(
      reconstructOcrText([
        [rectangle("Total:", 10, 20), rectangle("100", 300, 20)],
        [rectangle("Total:", 10, 20), rectangle("200", 300, 20)],
      ]),
    ).toBe("Total:\t100\n\nTotal:\t200");
  });

  it("keeps missing or unusable box text in source reading order", () => {
    expect(
      reconstructOcrText([
        [
          { text: "  Receipt  " },
          {
            text: "Date: 25/07/2021",
            points: [
              { x: Number.NaN, y: 0 },
              { x: 5, y: 6 },
            ],
          },
          rectangle("Total:", 10, 20),
          rectangle("12.50", 300, 20),
          { text: "Thank you", points: [{ x: 1, y: 1 }] },
          { text: "  " },
        ],
      ]),
    ).toBe("Receipt\nDate: 25/07/2021\nTotal:\t12.50\nThank you");
  });

  it("does not infer a slope from distant axis-aligned table cells", () => {
    expect(
      reconstructOcrText([
        [
          rectangle("Subtotal:", 10, 0, 80),
          rectangle("18,181", 300, 0),
          rectangle("Total:", 10, 30),
          rectangle("20,000", 300, 30),
          rectangle("Cash:", 10, 60),
          rectangle("100,000", 300, 60),
          rectangle("Change:", 10, 90),
          rectangle("80,000", 300, 90),
        ],
      ]),
    ).toBe(
      "Subtotal:\t18,181\nTotal:\t20,000\nCash:\t100,000\nChange:\t80,000",
    );
  });

  it("can recover axis-aligned box skew from consistent nearby word fragments", () => {
    const words: Detection[] = [];
    for (const [index, label] of ["Item", "Sub", "Grand"].entries()) {
      for (const [text, left, width] of [
        [label, 20, 60],
        ["total:", 85, 60],
        ["20,000", 300, 70],
      ] as const) {
        const word = skewed(text, left, 100 + index * 35, width);
        const xs = word.points!.map((point) => point.x);
        const ys = word.points!.map((point) => point.y);
        words.push({
          text,
          points: [
            { x: Math.min(...xs), y: Math.min(...ys) },
            { x: Math.max(...xs), y: Math.max(...ys) },
          ],
        });
      }
    }
    expect(reconstructOcrText([words])).toBe(
      "Item total:\t20,000\nSub total:\t20,000\nGrand total:\t20,000",
    );
    const shifted = words.map((word) => ({
      ...word,
      // Exercise negative grid cells, normalized scale and cell boundaries.
      points: word.points!.map(({ x, y }) => ({
        x: (x - 90.5) / 740,
        y: (y - 140.25) / 740,
      })),
    }));
    expect(reconstructOcrText([shifted])).toBe(reconstructOcrText([words]));
  });

  it("preserves every row of a thousand-word invoice with axis-aligned boxes", () => {
    const words: Detection[] = [];
    const expected: string[] = [];
    for (let row = 0; row < 100; row++) {
      const line: string[] = [];
      for (let column = 0; column < 10; column++) {
        const text = `${row}-${column}`;
        line.push(text);
        words.push(rectangle(text, column * 70, row * 30, 60, 18));
      }
      expected.push(line.join(" "));
    }
    expect(reconstructOcrText([[...words].reverse()])).toBe(
      expected.join("\n"),
    );
  });

  it("keeps an isolated rotated logo from rotating the entire receipt", () => {
    const words = [
      skewed("SHOP", 10, 0, 200, 20, 0.3),
      skewed("Subtotal:", 10, 80, 80, 20, 0),
      skewed("18,181", 300, 80, 60, 20, 0),
      skewed("Total:", 10, 110, 60, 20, 0),
      skewed("20,000", 300, 110, 60, 20, 0),
    ];
    expect(reconstructOcrText([words])).toBe(
      "SHOP\nSubtotal:\t18,181\nTotal:\t20,000",
    );
  });
});
