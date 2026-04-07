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

/** CSS colour for each tier (Tailwind-friendly hex values). */
export const HIT_QUALITY_COLOR: Record<HitQuality, string> = {
  Wrecks:       '#ef4444', // red-500
  Smashes:      '#f97316', // orange-500
  Penetrates:   '#eab308', // yellow-500
  Hits:         '#22c55e', // green-500
  'Glances Off':'#3b82f6', // blue-500
  Grazes:       '#8b5cf6', // violet-500
  Misses:       '#6b7280', // gray-500
};

export function emptyDistribution(): Record<HitQuality, number> {
  return {
    Wrecks:       0,
    Smashes:      0,
    Penetrates:   0,
    Hits:         0,
    'Glances Off': 0,
    Grazes:       0,
    Misses:       0,
  };
}
