type Point = { x: number; y: number };
type Detection = { text: string; points?: Point[] };
type PositionedWord = {
  text: string;
  points: Point[];
  order: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  center: number;
  height: number;
};
type Slope = { value: number; weight: number; word: number };

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function weightedMedian(samples: Slope[]) {
  const sorted = [...samples].sort((a, b) => a.value - b.value);
  const halfway = sorted.reduce((sum, sample) => sum + sample.weight, 0) / 2;
  let weight = 0;
  for (const sample of sorted) {
    weight += sample.weight;
    if (weight >= halfway) return sample.value;
  }
  return 0;
}

function supportedSlope(samples: Slope[], minimumWords: number) {
  if (new Set(samples.map((sample) => sample.word)).size < minimumWords)
    return null;
  const value = weightedMedian(samples);
  const inliers = samples.filter(
    (sample) => Math.abs(sample.value - value) <= 0.04,
  );
  const totalWeight = samples.reduce((sum, sample) => sum + sample.weight, 0);
  const inlierWeight = inliers.reduce((sum, sample) => sum + sample.weight, 0);
  if (
    inlierWeight < totalWeight * 0.65 ||
    new Set(inliers.map((sample) => sample.word)).size < minimumWords
  )
    return null;
  return weightedMedian(inliers);
}

function estimateSlope(words: PositionedWord[]) {
  const edges: Slope[] = [];
  const typicalWidth = median(words.map((word) => word.right - word.left));
  for (const word of words) {
    // Two corners describe an axis-aligned rectangle, not a text baseline.
    if (word.points.length !== 4 || word.right - word.left < word.height * 1.5)
      continue;
    const byX = [...word.points].sort((a, b) => a.x - b.x);
    const left = byX.slice(0, 2).sort((a, b) => a.y - b.y);
    const right = byX.slice(2).sort((a, b) => a.y - b.y);
    for (let index = 0; index < 2; index++) {
      const dx = right[index]!.x - left[index]!.x;
      const dy = right[index]!.y - left[index]!.y;
      const value = dy / dx;
      if (dx > 0 && Math.abs(value) <= 0.4)
        edges.push({
          value,
          weight: Math.min(dx, typicalWidth * 3),
          word: word.order,
        });
    }
  }
  const edgeSlope = supportedSlope(edges, 2);
  if (edgeSlope !== null && Math.abs(edgeSlope) > 0.005) return edgeSlope;

  // Axis-aligned boxes lose their text angle. Only nearby fragments with
  // consistent geometry can supply it; distant columns can alias other rows.
  const nearby: Slope[] = [];
  const cellSize = median(words.map((word) => word.height));
  const cells = new Map<string, PositionedWord[]>();
  for (const word of words) {
    const key = `${Math.floor(word.left / cellSize)},${Math.floor(word.center / cellSize)}`;
    const cell = cells.get(key) ?? [];
    cell.push(word);
    cells.set(key, cell);
  }
  for (const cell of cells.values()) cell.sort((a, b) => a.left - b.left);
  for (const left of words) {
    const minX = Math.floor(left.right / cellSize);
    const maxX = Math.floor((left.right + left.height * 1.5) / cellSize);
    const minY = Math.floor((left.center - left.height * 0.6) / cellSize);
    const maxY = Math.floor((left.center + left.height * 0.6) / cellSize);
    const adjacent: PositionedWord[] = [];
    if ((maxX - minX + 1) * (maxY - minY + 1) > words.length) {
      // A rare oversized logo/heading should not enumerate thousands of
      // empty grid cells. The usual body text only searches nearby cells.
      adjacent.push(...words.filter((word) => word.left >= left.right));
    } else {
      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          const cell = cells.get(`${x},${y}`);
          if (!cell) continue;
          let low = 0;
          let high = cell.length;
          while (low < high) {
            const middle = Math.floor((low + high) / 2);
            if (cell[middle]!.left < left.right) low = middle + 1;
            else high = middle;
          }
          for (let index = low; index < cell.length; index++) {
            const right = cell[index]!;
            if (right.left - left.right > left.height * 1.5) break;
            adjacent.push(right);
          }
        }
      }
    }
    for (const right of adjacent) {
      const height = Math.min(left.height, right.height);
      const gap = right.left - left.right;
      const dx = (right.left + right.right - left.left - left.right) / 2;
      if (
        height <= 0 ||
        gap < 0 ||
        gap > height * 1.5 ||
        Math.abs(left.height - right.height) > height * 0.2 ||
        Math.abs(right.center - left.center) > height * 0.6 ||
        dx <= height
      )
        continue;
      const value = (right.center - left.center) / dx;
      if (Math.abs(value) <= 0.25)
        nearby.push({ value, weight: 1, word: left.order });
    }
  }
  const localSlope = supportedSlope(nearby, 3);
  return localSlope !== null && Math.abs(localSlope) >= 0.015
    ? localSlope
    : (edgeSlope ?? 0);
}

function position(detection: Detection, order: number): PositionedWord | null {
  const points = detection.points;
  if (
    !points ||
    points.length < 2 ||
    points.some(
      (point) => !Number.isFinite(point.x) || !Number.isFinite(point.y),
    )
  )
    return null;
  const left = Math.min(...points.map((point) => point.x));
  const right = Math.max(...points.map((point) => point.x));
  const top = Math.min(...points.map((point) => point.y));
  const bottom = Math.max(...points.map((point) => point.y));
  if (right <= left || bottom <= top) return null;
  return {
    text: detection.text.trim(),
    points,
    order,
    left,
    right,
    top,
    bottom,
    center: (top + bottom) / 2,
    height: bottom - top,
  };
}

function reconstructBlock(words: PositionedWord[]) {
  if (!words.length) return "";
  const slope = estimateSlope(words);
  const corrected = words
    .map((word) => {
      const ys = word.points.map((point) => point.y - slope * point.x);
      const top = Math.min(...ys);
      const bottom = Math.max(...ys);
      // Rotating an axis-aligned envelope inflates it; its font height is
      // better estimated by removing the skew contribution from its width.
      const height =
        word.points.length === 2
          ? Math.max(
              word.height * 0.5,
              word.height - Math.abs(slope) * (word.right - word.left),
            )
          : bottom - top;
      return { ...word, top, bottom, center: (top + bottom) / 2, height };
    })
    .sort(
      (a, b) => a.center - b.center || a.left - b.left || a.order - b.order,
    );
  const rows: PositionedWord[][] = [];
  for (const word of corrected) {
    const candidates = rows.flatMap((row) => {
      // Vertically adjacent text in the same column is a different row,
      // even if a larger heading's box overlaps it.
      if (
        row.some(
          (other) =>
            Math.min(word.right, other.right) -
              Math.max(word.left, other.left) >
            Math.min(word.right - word.left, other.right - other.left) * 0.3,
        )
      )
        return [];
      const height = median(row.map((other) => other.height));
      const center = median(row.map((other) => other.center));
      const bottom = median(row.map((other) => other.bottom));
      const distance = Math.abs(center - word.center);
      const tolerance = Math.min(height, word.height) * 0.55;
      const baselineDistance = Math.abs(bottom - word.bottom);
      const differentFont =
        Math.max(height, word.height) > Math.min(height, word.height) * 1.35;
      if (
        distance <= tolerance ||
        (differentFont &&
          baselineDistance <= tolerance * 0.6 &&
          distance <= Math.max(height, word.height) * 0.6)
      )
        return [
          {
            row,
            distance: differentFont
              ? Math.min(distance, baselineDistance)
              : distance,
          },
        ];
      return [];
    });
    const nearest = candidates.sort((a, b) => a.distance - b.distance)[0];
    if (nearest) nearest.row.push(word);
    else rows.push([word]);
  }
  return rows
    .sort(
      (a, b) =>
        median(a.map((word) => word.center)) -
        median(b.map((word) => word.center)),
    )
    .map((row) => {
      const height = median(row.map((word) => word.height));
      return row
        .sort((a, b) => a.left - b.left || a.order - b.order)
        .map((word, index, line) => {
          const previous = line[index - 1];
          if (!previous) return word.text;
          const characterWidth = Math.max(
            (previous.right - previous.left) / previous.text.length,
            (word.right - word.left) / word.text.length,
          );
          const separator =
            word.left - previous.right >
            Math.max(height * 2.5, characterWidth * 5)
              ? "\t"
              : " ";
          return separator + word.text;
        })
        .join("");
    })
    .join("\n");
}

/** Recover reading rows without changing recognized characters or prices. */
export function reconstructOcrText(pages: Detection[][]): string {
  return pages
    .map((page) => {
      const sections: string[] = [];
      let positioned: PositionedWord[] = [];
      for (const [order, detection] of page.entries()) {
        if (!detection.text.trim()) continue;
        const word = position(detection, order);
        if (word) positioned.push(word);
        else {
          // An unpositioned detection is a reading-order boundary. Inventing
          // its coordinates could attach it to an unrelated label.
          if (positioned.length) sections.push(reconstructBlock(positioned));
          positioned = [];
          sections.push(detection.text.trim());
        }
      }
      if (positioned.length) sections.push(reconstructBlock(positioned));
      return sections.join("\n");
    })
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 100_000);
}
