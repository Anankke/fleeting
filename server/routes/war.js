'use strict';

const { requireRole } = require('../lib/auth');
const snapshotStore   = require('../store/snapshotStore');
const { getOpenFleets } = require('../db/queries/fleets');

async function warRoutes(fastify) {
  // GET /api/war/fleets — list all open fleet sessions with live aggregates
  fastify.get('/api/war/fleets', { preHandler: requireRole('war_commander') }, async (req, reply) => {
    const openFleets = await getOpenFleets();
    const result = await Promise.all(
      openFleets.map(async (f) => {
        const agg = await snapshotStore.getFleetAggregate(f.id);
        return {
          id:          f.id,
          name:        f.name,
          createdAt:   f.created_at,
          memberCount: agg?.memberCount ?? 0,
          aggregate:   agg,
        };
      }),
    );
    reply.send(result);
  });

  // GET /api/war/snapshot?fleets=id1,id2,... — combined aggregate across selected fleets
  fastify.get('/api/war/snapshot', { preHandler: requireRole('war_commander') }, async (req, reply) => {
    const { fleets } = req.query;
    let fleetIds;

    if (fleets) {
      fleetIds = fleets.split(',').map((s) => s.trim()).filter(Boolean);
    } else {
      const openFleets = await getOpenFleets();
      fleetIds = openFleets.map((f) => f.id);
    }

    const warAgg = await snapshotStore.getWarAggregate(fleetIds);
    if (!warAgg) return reply.code(404).send({ error: 'No active fleet data' });
    reply.send(warAgg);
  });
}

module.exports = warRoutes;
