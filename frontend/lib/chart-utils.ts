/**
 * Reduce a long series for charting.
 *
 * Recharts degrades noticeably past a few thousand points, and at screen width
 * the extra resolution is invisible: a 2,000-point series drawn across roughly
 * 900 pixels has more than two points per pixel. The final point is always
 * kept so the series ends on its real last date rather than wherever the
 * stride happened to land.
 *
 * This is a display concern only. Every statistic is computed by the Python
 * engine on the complete series before anything reaches the browser.
 */
export function downsample<T>(points: T[], maxPoints = 420): T[] {
  if (points.length <= maxPoints) return points;

  const step = Math.ceil(points.length / maxPoints);
  const sampled = points.filter((_, index) => index % step === 0);

  const lastPoint = points[points.length - 1];
  if (sampled[sampled.length - 1] !== lastPoint) sampled.push(lastPoint);

  return sampled;
}
