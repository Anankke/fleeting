import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../lib/auth.js';
import { characterBelongsToUser } from '../db/queries/users.js';
import * as snapshotStore from '../store/snapshotStore.js';
import type { PilotSnapshot } from '../lib/aggregate.js';
import { publish } from '../lib/nchanPublisher.js';
import { write } from '../lib/historyWriter.js';
import { exchangeEveToken } from '../lib/auth.js';
import { getCharacterOnlineStatus } from '../lib/esi.js';

/** Numeric fields expected in the snapshot that must be finite numbers. */
const NUMERIC_SNAPSHOT_FIELDS = [
  'dpsOut', 'dpsIn', 'logiOut', 'logiIn',
  'capTransfered', 'capRecieved', 'capDamageOut', 'capDamageIn', 'mined',
] as const;

/** Returns true when value is a finite number (rejects NaN, Infinity, non-numbers). */
function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Validate and sanitize the numeric fields of an incoming snapshot. */
function sanitizeSnapshot(raw: Record<string, unknown>): PilotSnapshot {
  const out: Record<string, unknown> = {};
  for (const field of NUMERIC_SNAPSHOT_FIELDS) {
    const v = raw[field];
    out[field] = isFiniteNumber(v) ? v : 0;
  }
  // Pass through safe non-numeric fields
  if (raw['hitQualityDistribution'] !== undefined) out['hitQualityDistribution'] = raw['hitQualityDistribution'];
  if (raw['percentiles'] !== undefined) out['percentiles'] = raw['percentiles'];
  if (Array.isArray(raw['breakdown'])) out['breakdown'] = raw['breakdown'];
  return out as unknown as PilotSnapshot;
}

export default async function pilotRoutes(fastify: FastifyInstance) {
  // GET /api/character/:id/online — proxy ESI online status for the character
  fastify.get('/api/character/:id/online', { preHandler: requireAuth }, async (req, reply) => {
    const params = req.params as { id: string };
    const characterId = Number(params.id);
    if (!Number.isInteger(characterId) || characterId <= 0) {
      return reply.code(400).send({ error: 'Invalid characterId' });
    }
    const s = req.session as unknown as Record<string, unknown>;
    const owned = await characterBelongsToUser(s['userId'] as string, characterId);
    if (!owned) return reply.code(403).send({ error: 'Character does not belong to your account' });
    try {
      const token  = await exchangeEveToken(characterId, req.session);
      const status = await getCharacterOnlineStatus(token, characterId);
      reply.send({ online: status.online });
    } catch {
      // If ESI fails we conservatively report offline so fleet ops are skipped.
      reply.send({ online: false });
    }
  });

  fastify.post('/api/pilot/data', { preHandler: requireAuth }, async (req, reply) => {
    const body = req.body as Record<string, unknown> | null;
    const { characterId, fleetSessionId, snapshot } = body ?? {};

    if (!characterId || !snapshot) {
      return reply.code(400).send({ error: 'characterId and snapshot are required' });
    }

    const s = req.session as unknown as Record<string, unknown>;
    const owned = await characterBelongsToUser(s['userId'] as string, characterId as number);
    if (!owned) {
      return reply.code(403).send({ error: 'Character does not belong to your account' });
    }

    const snap: PilotSnapshot = sanitizeSnapshot({
      ...(snapshot as Record<string, unknown>),
      characterId: characterId as number,
    });

    if (fleetSessionId) {
      await snapshotStore.setPilotSnapshot(fleetSessionId as string, characterId as number, snap);
      await snapshotStore.addFleetMember(fleetSessionId as string, characterId as number);

      const fleetAgg = await snapshotStore.getFleetAggregate(fleetSessionId as string);
      if (fleetAgg) {
        publish(fleetSessionId as string, { ...fleetAgg, fleetSessionId }).catch(console.error);
      }

      write({ fleetSessionId: fleetSessionId as string, characterId: characterId as number, snapshot: snapshot as Parameters<typeof write>[0]['snapshot'] }).catch(console.error);
    }

    reply.code(204).send();
  });
}
