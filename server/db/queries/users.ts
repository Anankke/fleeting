import { query } from '../pg.js';

export async function findByOidcSub(sub: string) {
  const { rows } = await query('SELECT * FROM users WHERE oidc_sub = $1', [sub]);
  return rows[0] ?? null;
}

export async function getCharactersByUserId(userId: string) {
  const { rows } = await query(
    'SELECT id, character_name AS name FROM eve_characters WHERE user_id = $1',
    [userId],
  );
  return rows as Array<{ id: number; name: string }>;
}

export async function characterBelongsToUser(userId: string, characterId: number): Promise<boolean> {
  const { rows } = await query(
    'SELECT id FROM eve_characters WHERE id = $1 AND user_id = $2',
    [characterId, userId],
  );
  return rows.length > 0;
}
