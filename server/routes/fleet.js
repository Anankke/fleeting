'use strict';

const { requireAuth, requireRole, exchangeEveToken } = require('../lib/auth');
const { getFleetForCharacter } = require('../lib/esi');
const { startTracking, stopTracking } = require('../lib/memberTracker');
const { characterBelongsToUser } = require('../db/queries/users');
const { getFleetSystemSnapshot } = require('../db/queries/members');
const fleets = require('../db/queries/fleets');
const snapshotStore = require('../store/snapshotStore');

async function fleetRoutes(fastify) {
  // POST /api/fleet — FC creates a new fleet session
  fastify.post('/api/fleet', { preHandler: requireRole('fc') }, async (req, reply) => {
    const { name, fcCharacterId, linkEveFleet = false } = req.body ?? {};
    if (!name || !fcCharacterId) {
      return reply.code(400).send({ error: 'name and fcCharacterId are required' });
    }

    const owned = await characterBelongsToUser(req.session.userId, fcCharacterId);
    if (!owned) return reply.code(403).send({ error: 'Character not owned by you' });

    let eveFleetId = null;
    if (linkEveFleet) {
      try {
        const token = await exchangeEveToken(fcCharacterId);
        const info  = await getFleetForCharacter(token, fcCharacterId);
        eveFleetId  = info.fleet_id;
      } catch (err) {
        return reply.code(502).send({ error: `ESI fleet lookup failed: ${err.message}` });
      }
    }

    const fleet = await fleets.createFleet({ name, eveFleetId, fcCharacterId });

    // Create a dedicated combat_events partition for this fleet
    fleets.createPartitionForFleet(fleet.id).catch(console.error);

    if (eveFleetId) {
      startTracking(fleet.id, fcCharacterId, eveFleetId);
    }

    reply.code(201).send(fleet);
  });

  // GET /api/fleet/discover — find active fleet session for a character's current EVE fleet
  fastify.get('/api/fleet/discover', { preHandler: requireAuth }, async (req, reply) => {
    const { characterId } = req.query;
    if (!characterId) return reply.code(400).send({ error: 'characterId is required' });

    const owned = await characterBelongsToUser(req.session.userId, Number(characterId));
    if (!owned) return reply.code(403).send({ error: 'Character not owned by you' });

    try {
      const token    = await exchangeEveToken(Number(characterId));
      const esiFleet = await getFleetForCharacter(token, Number(characterId));
      const { rows } = await require('../db/pg').query(
        'SELECT * FROM fleet_sessions WHERE eve_fleet_id = $1 AND is_open = TRUE LIMIT 1',
        [esiFleet.fleet_id],
      );
      if (!rows.length) return reply.code(404).send({ error: 'No active fleet session found' });
      reply.send(rows[0]);
    } catch (err) {
      reply.code(404).send({ error: 'Not in a fleet' });
    }
  });

  // GET /api/fleet/my — all fleet sessions created by this FC
  fastify.get('/api/fleet/my', { preHandler: requireRole('fc') }, async (req, reply) => {
    const { characterId } = req.query;
    if (!characterId) return reply.code(400).send({ error: 'characterId is required' });
    const owned = await characterBelongsToUser(req.session.userId, Number(characterId));
    if (!owned) return reply.code(403).send({ error: 'Character not owned by you' });
    reply.send(await fleets.getFleetsByFc(Number(characterId)));
  });

  // POST /api/fleet/:id/join
  fastify.post('/api/fleet/:id/join', { preHandler: requireAuth }, async (req, reply) => {
    const { characterId } = req.body ?? {};
    if (!characterId) return reply.code(400).send({ error: 'characterId is required' });
    const owned = await characterBelongsToUser(req.session.userId, characterId);
    if (!owned) return reply.code(403).send({ error: 'Character not owned by you' });
    const fleet = await fleets.getFleetById(req.params.id);
    if (!fleet || !fleet.is_open) return reply.code(404).send({ error: 'Fleet not found' });
    await require('../db/queries/members').upsertFleetMember(req.params.id, characterId);
    reply.send({ ok: true });
  });

  // GET /api/fleet/:id/snapshot — live aggregate + presence snapshot
  fastify.get('/api/fleet/:id/snapshot', { preHandler: requireAuth }, async (req, reply) => {
    const fleet = await fleets.getFleetById(req.params.id);
    if (!fleet) return reply.code(404).send({ error: 'Fleet not found' });

    const [agg, presence] = await Promise.all([
      snapshotStore.getFleetAggregate(req.params.id),
      getFleetSystemSnapshot(req.params.id),
    ]);

    reply.send({ aggregate: agg, presence });
  });

  // DELETE /api/fleet/:id — close fleet
  fastify.delete('/api/fleet/:id', { preHandler: requireRole('fc') }, async (req, reply) => {
    const fleet = await fleets.getFleetById(req.params.id);
    if (!fleet) return reply.code(404).send({ error: 'Fleet not found' });

    const owned = await characterBelongsToUser(req.session.userId, fleet.fc_character_id);
    if (!owned) return reply.code(403).send({ error: 'Not your fleet' });

    await fleets.closeFleet(req.params.id);
    stopTracking(req.params.id);
    reply.send({ ok: true });
  });
}

module.exports = fleetRoutes;
