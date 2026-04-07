import { query } from '../pg.js';

interface CombatEvent {
  fleetSessionId: string;
  sourceCharacterId: number;
  targetName?: string | null;
  weaponType?: string | null;
  shipType?: string | null;
  category: string;
  amount: number;
  hitQuality?: string | null;
  occurredAt: Date | string;
}

interface SearchFilters {
  charId?: number;
  category?: string;
  target?: string;
  weapon?: string;
  hitQuality?: string;
  from?: string;
  to?: string;
}

interface Pagination {
  page?: number;
  limit?: number;
}

export async function insertBatch(events: CombatEvent[]) {
  if (!events.length) return;

  const cols = [
    'fleet_session_id', 'source_character_id', 'target_name',
    'weapon_type', 'ship_type', 'category', 'amount', 'hit_quality', 'occurred_at',
  ];
  const numCols = cols.length;
  const valuePlaceholders = events.map((_, i) =>
    `(${cols.map((__, j) => `$${i * numCols + j + 1}`).join(', ')})`,
  );

  const params = events.flatMap((e) => [
    e.fleetSessionId,
    e.sourceCharacterId,
    e.targetName ?? null,
    e.weaponType ?? null,
    e.shipType ?? null,
    e.category,
    e.amount,
    e.hitQuality ?? null,
    e.occurredAt,
  ]);

  await query(
    `INSERT INTO combat_events (${cols.join(', ')}) VALUES ${valuePlaceholders.join(', ')}`,
    params,
  );
}

export async function search(
  fleetSessionId: string,
  filters: SearchFilters = {},
  { page = 1, limit = 100 }: Pagination = {},
): Promise<{ total: number; rows: unknown[] }> {
  const conditions = ['fleet_session_id = $1'];
  const params: unknown[] = [fleetSessionId];
  let n = 2;

  if (filters.charId !== undefined) {
    conditions.push(`source_character_id = $${n++}`);
    params.push(filters.charId);
  }
  if (filters.category !== undefined) {
    conditions.push(`category = $${n++}`);
    params.push(filters.category);
  }
  if (filters.target !== undefined) {
    conditions.push(`target_name ILIKE $${n++}`);
    params.push(`%${filters.target}%`);
  }
  if (filters.weapon !== undefined) {
    conditions.push(`weapon_type ILIKE $${n++}`);
    params.push(`%${filters.weapon}%`);
  }
  if (filters.hitQuality !== undefined) {
    conditions.push(`hit_quality = $${n++}`);
    params.push(filters.hitQuality);
  }
  if (filters.from !== undefined) {
    conditions.push(`occurred_at >= $${n++}`);
    params.push(filters.from);
  }
  if (filters.to !== undefined) {
    conditions.push(`occurred_at <= $${n++}`);
    params.push(filters.to);
  }

  const where = conditions.join(' AND ');
  const offset = (page - 1) * limit;

  const [countRes, rowsRes] = await Promise.all([
    query(`SELECT COUNT(*) FROM combat_events WHERE ${where}`, params),
    query(
      `SELECT * FROM combat_events WHERE ${where}
       ORDER BY occurred_at DESC LIMIT $${n} OFFSET $${n + 1}`,
      [...params, limit, offset],
    ),
  ]);

  return {
    total: parseInt(countRes.rows[0].count as string, 10),
    rows: rowsRes.rows,
  };
}
