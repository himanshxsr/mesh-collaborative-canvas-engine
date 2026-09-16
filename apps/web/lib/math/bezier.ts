export function ramerDouglasPeucker(
  points: ReadonlyArray<[number, number]>,
  epsilon: number = 0.5
): Array<[number, number]> {
  if (points.length <= 2) return [...points];

  let dmax = 0;
  let index = 0;
  const [x1, y1] = points[0];
  const [x2, y2] = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i];
    const numerator = Math.abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1);
    const denominator = Math.hypot(y2 - y1, x2 - x1);
    const d = denominator === 0 ? Math.hypot(x - x1, y - y1) : numerator / denominator;

    if (d > dmax) {
      index = i;
      dmax = d;
    }
  }

  if (dmax > epsilon) {
    const recResults1 = ramerDouglasPeucker(points.slice(0, index + 1), epsilon);
    const recResults2 = ramerDouglasPeucker(points.slice(index), epsilon);
    return [...recResults1.slice(0, -1), ...recResults2];
  } else {
    return [points[0], points[points.length - 1]];
  }
}

export function generateSmoothBezierPath(points: ReadonlyArray<[number, number]>): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0][0]} ${points[0][1]}`;
  if (points.length === 2) return `M ${points[0][0]} ${points[0][1]} L ${points[1][0]} ${points[1][1]}`;

  let d = `M ${points[0][0]} ${points[0][1]}`;

  for (let i = 0; i < points.length - 1; i++) {
    const pCurrent = points[i];
    const pNext = points[i + 1];
    const midX = (pCurrent[0] + pNext[0]) / 2;
    const midY = (pCurrent[1] + pNext[1]) / 2;

    d += ` Q ${pCurrent[0]} ${pCurrent[1]}, ${midX} ${midY}`;
  }

  const last = points[points.length - 1];
  d += ` L ${last[0]} ${last[1]}`;

  return d;
}
