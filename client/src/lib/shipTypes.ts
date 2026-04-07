/**
 * shipTypes.ts
 *
 * Offline ship type lookup: Map<typeId, { name, groupId }>
 *
 * This file is auto-generated at build time by client/scripts/fetchSDE.mjs.
 * During development, a small built-in stub is included so the app builds without
 * running the SDE fetch. The full dataset is generated before `rsbuild build`.
 *
 * To regenerate manually:
 *   node scripts/fetchSDE.mjs
 */

export interface ShipType {
  name:    string;
  groupId: number;
}

/* eslint-disable */
// @generated — do not edit by hand
const SHIP_TYPES_DATA: [number, ShipType][] = [
  // Stub entries — overwritten by fetchSDE.mjs
  [670,   { name: 'Capsule',         groupId: 29   }],
  [588,   { name: 'Ibis',            groupId: 1    }],
  [596,   { name: 'Velator',         groupId: 1    }],
  [601,   { name: 'Reaper',          groupId: 1    }],
  [606,   { name: 'Impairor',        groupId: 1    }],
  [648,   { name: 'Badger',          groupId: 22   }],
  [2998,  { name: 'Drake',           groupId: 26   }],  // Battlecruiser
  [34562, { name: 'Svipul',          groupId: 419  }],  // Tactical Destroyer
  [17738, { name: 'Megathron',       groupId: 27   }],  // Battleship
  [641,   { name: 'Rifter',          groupId: 25   }],  // Frigate
  [11202, { name: 'Vagabond',        groupId: 26   }],  // Heavy Assault Cruiser
];
/* eslint-enable */

export const shipTypes: ReadonlyMap<number, ShipType> = new Map(SHIP_TYPES_DATA);
