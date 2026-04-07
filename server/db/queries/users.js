'use strict';

const { query } = require('../pg');

async function findByOidcSub(sub) {
  const { rows } = await query('SELECT * FROM users WHERE oidc_sub = $1', [sub]);
  return rows[0] ?? null;
}

async function getCharactersByUserId(userId) {
  const { rows } = await query(
    'SELECT id, character_name AS name FROM eve_characters WHERE user_id = $1',
    [userId],
  );
  return rows;
}

/**
 * Validate that a characterId belongs to the authenticated userId.
 */
async function characterBelongsToUser(userId, characterId) {
  const { rows } = await query(
    'SELECT id FROM eve_characters WHERE id = $1 AND user_id = $2',
    [characterId, userId],
  );
  return rows.length > 0;
}

module.exports = { findByOidcSub, getCharactersByUserId, characterBelongsToUser };
