/**
 * hitQuality.ts — Hit qualifier constants and tier colour map.
 */

export type HitQuality =
  | 'Wrecks'
  | 'Smashes'
  | 'Penetrates'
  | 'Hits'
  | 'Glances Off'
  | 'Grazes'
  | 'Misses';

/** All qualifiers in descending quality order. */
export const HIT_QUALITIES: HitQuality[] = [
  'Wrecks',
  'Smashes',
  'Penetrates',
  'Hits',
  'Glances Off',
  'Grazes',
  'Misses',
];

/** CSS colour for each tier. Unknown strings fall back to a grey default. */
export const HIT_QUALITY_COLOR: Record<string, string> = {
  Wrecks:        '#ef4444',
  Smashes:       '#f97316',
  Penetrates:    '#eab308',
  Hits:          '#22c55e',
  'Glances Off': '#3b82f6',
  Grazes:        '#8b5cf6',
  Misses:        '#6b7280',
};

/** Return the colour for a quality string, including untranslated raw strings. */
export function hitQualityColor(q: string): string {
  return HIT_QUALITY_COLOR[q] ?? '#4b5563';
}

/**
 * Returns '#000000' or '#ffffff' — whichever gives better contrast against
 * the given hex background colour (ITU-R BT.601 perceived luminance).
 */
export function contrastColor(hex: string): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return '#ffffff';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

export function emptyDistribution(): Record<string, number> {
  return {
    Wrecks:        0,
    Smashes:       0,
    Penetrates:    0,
    Hits:          0,
    'Glances Off': 0,
    Grazes:        0,
    Misses:        0,
  };
}
