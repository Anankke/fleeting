'use strict';

const { requireAuth }      = require('../lib/auth');
const { characterBelongsToUser } = require('../db/queries/users');
const snapshotStore        = require('../store/snapshotStore');
const nchanPublisher       = require('../lib/nchanPublisher');
const historyWriter        = require('../lib/historyWriter');

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
async function pilotRoutes(fastify) {
  fastify.post('/api/pilot/data', { preHandler: requireAuth }, async (req, reply) => {
    const { characterId, fleetSessionId, snapshot } = req.body ?? {};

    if (!characterId || !snapshot) {
      return reply.code(400).send({ error: 'characterId and snapshot are required' });
    }

    // Validate that the character belongs to this user
    const owned = await characterBelongsToUser(req.session.userId, characterId);
    if (!owned) {
      return reply.code(403).send({ error: 'Character does not belong to your account' });
    }

    // Attach characterId to snapshot for member tracking in snapshotStore
    const snap = { ...snapshot, characterId };

    // Store live snapshot in Memcached
    if (fleetSessionId) {
      await snapshotStore.setPilotSnapshot(fleetSessionId, characterId, snap);
      await snapshotStore.addFleetMember(fleetSessionId, characterId);

      // Compute fleet aggregate and publish to Nchan
      const fleetAgg = await snapshotStore.getFleetAggregate(fleetSessionId);
      if (fleetAgg) {
        nchanPublisher
          .publish(fleetSessionId, { ...fleetAgg, fleetSessionId })
          .catch(console.error);
      }

      // Write history (fire-and-forget for all three paths)
      historyWriter.write({ fleetSessionId, characterId, snapshot }).catch(console.error);
    }

    reply.code(204).send();
  });
}

module.exports = pilotRoutes;
