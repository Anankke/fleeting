import type { FastifyInstance } from 'fastify';
import { requireRole } from '../lib/auth.js';
import { ROLES } from '../lib/roles.js';
import * as snapshotStore from '../store/snapshotStore.js';
import { getOpenFleets } from '../db/queries/fleets.js';

export default async function warRoutes(fastify: FastifyInstance) {
  // GET /api/war/fleets — list all open fleet sessions with live aggregates
  fastify.get('/api/war/fleets', { preHandler: requireRole(ROLES.WAR_COMMANDER) }, async (_req, reply) => {
    const openFleets = await getOpenFleets();
    const result = await Promise.all(
      openFleets.map(async (f: Record<string, unknown>) => {
        const agg = await snapshotStore.getFleetAggregate(f['id'] as string);
        return {
          id:          f['id'],
          name:        f['name'],
          createdAt:   f['created_at'],
          memberCount: (agg as Record<string, unknown> | null)?.['memberCount'] ?? 0,
          aggregate:   agg,
        };
      }),
    );
    reply.send(result);
  });

  // GET /api/war/snapshot?fleets=id1,id2,... — combined aggregate across selected fleets
  fastify.get('/api/war/snapshot', { preHandler: requireRole(ROLES.WAR_COMMANDER) }, async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    let fleetIds: string[];

    if (q['fleets']) {
      fleetIds = q['fleets'].split(',').map((s) => s.trim()).filter(Boolean);
    } else {
      const openFleets = await getOpenFleets();
      fleetIds = openFleets.map((f: Record<string, unknown>) => f['id'] as string);
    }

    const warAgg = await snapshotStore.getWarAggregate(fleetIds);
    if (!warAgg) return reply.code(404).send({ error: 'No active fleet data' });
    reply.send(warAgg);
  });
}
