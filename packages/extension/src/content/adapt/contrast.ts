/**
 * Colour maths for the contrast option (WCAG 2 relative luminance and contrast ratio). Pure.
 */

export type Rgba = [r: number, g: number, b: number, a: number];

/** Parse a computed colour (`rgb(…)` / `rgba(…)`, the form getComputedStyle returns). */
export function parseColor(css: string): Rgba | null {
  const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(
    css.trim(),
  );
  if (!m) return null;
  const alpha = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : +m[4];
  return [+(m[1] ?? 0), +(m[2] ?? 0), +(m[3] ?? 0), alpha];
}

export function toCss([r, g, b]: Rgba): string {
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance([r, g, b]: Rgba): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function ratio(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** `top` drawn over an opaque `bottom`. */
export function over(top: Rgba, bottom: Rgba): Rgba {
  const a = top[3];
  return [
    top[0] * a + bottom[0] * (1 - a),
    top[1] * a + bottom[1] * (1 - a),
    top[2] * a + bottom[2] * (1 - a),
    1,
  ];
}

export const MIN_RATIO = 4.5;

/**
 * A text colour with at least `min` contrast on `bg`, moved toward black (light background) or
 * white (dark background) in small steps so it keeps its hue. Null when it already passes.
 */
export function fixColor(fg: Rgba, bg: Rgba, min = MIN_RATIO): Rgba | null {
  const solid = over(fg, bg);
  if (ratio(solid, bg) >= min) return null;
  const toward: Rgba = luminance(bg) > 0.18 ? [0, 0, 0, 1] : [255, 255, 255, 1];
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    const c: Rgba = [
      solid[0] + (toward[0] - solid[0]) * t,
      solid[1] + (toward[1] - solid[1]) * t,
      solid[2] + (toward[2] - solid[2]) * t,
      1,
    ];
    if (ratio(c, bg) >= min) return c;
  }
  return toward;
}
