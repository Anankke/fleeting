'use strict';

const { requireRole } = require('../lib/auth');
const historyQueries   = require('../db/queries/history');
const events           = require('../db/queries/events');
const snapshots        = require('../db/queries/snapshots');
const timeline         = require('../db/queries/timeline');
const { getPresenceTimeline } = require('../db/queries/members');
const { getFleetById } = require('../db/queries/fleets');

function requireFCOrWar(req, reply, done) {
  if (req.session.roles?.includes('fc') || req.session.roles?.includes('war_commander')) {
    return done();
  }
  reply.code(403).send({ error: 'Forbidden' });
}

async function historyRoutes(fastify) {
  // GET /api/history/fleets — paginated list
  fastify.get('/api/history/fleets', { preHandler: [requireRole('fc')] }, async (req, reply) => {
    // Allow both fc and war_commander
    if (!req.session.roles?.includes('fc') && !req.session.roles?.includes('war_commander')) {
      return reply.code(403).send({ error: 'Forbidden' });
    }
    const { page = 1, limit = 20 } = req.query;
    reply.send(await historyQueries.getFleetList({ page: Number(page), limit: Number(limit) }));
  });

  // GET /api/history/fleet/:id/summary
  fastify.get('/api/history/fleet/:id/summary', { preHandler: requireFCOrWar }, async (req, reply) => {
    const fleet = await getFleetById(req.params.id);
    if (!fleet) return reply.code(404).send({ error: 'Fleet not found' });
    reply.send(await historyQueries.getFleetSummary(req.params.id));
  });

  // GET /api/history/fleet/:id/timeline
  fastify.get('/api/history/fleet/:id/timeline', { preHandler: requireFCOrWar }, async (req, reply) => {
    const fleet = await getFleetById(req.params.id);
    if (!fleet) return reply.code(404).send({ error: 'Fleet not found' });
    reply.send(await timeline.getForFleet(req.params.id));
  });

  // GET /api/history/fleet/:id/snapshots/:charId
  fastify.get('/api/history/fleet/:id/snapshots/:charId', { preHandler: requireFCOrWar }, async (req, reply) => {
    const fleet = await getFleetById(req.params.id);
    if (!fleet) return reply.code(404).send({ error: 'Fleet not found' });
    reply.send(await snapshots.getForPilot(req.params.id, req.params.charId));
  });

  // GET /api/history/fleet/:id/presence
  fastify.get('/api/history/fleet/:id/presence', { preHandler: requireFCOrWar }, async (req, reply) => {
    const fleet = await getFleetById(req.params.id);
    if (!fleet) return reply.code(404).send({ error: 'Fleet not found' });
    reply.send(await getPresenceTimeline(req.params.id));
  });

  // GET /api/history/fleet/:id/events — paginated + filtered
  fastify.get('/api/history/fleet/:id/events', { preHandler: requireFCOrWar }, async (req, reply) => {
    const fleet = await getFleetById(req.params.id);
    if (!fleet) return reply.code(404).send({ error: 'Fleet not found' });

    const { page = 1, limit = 100, charId, category, target, weapon, hitQuality, from, to } = req.query;
    const result = await events.search(
      req.params.id,
      { charId: charId ? Number(charId) : undefined, category, target, weapon, hitQuality, from, to },
      { page: Number(page), limit: Math.min(Number(limit), 500) },
    );
    reply.send(result);
  });

  // GET /api/history/fleet/:id/participation
  fastify.get('/api/history/fleet/:id/participation', { preHandler: requireFCOrWar }, async (req, reply) => {
    const fleet = await getFleetById(req.params.id);
    if (!fleet) return reply.code(404).send({ error: 'Fleet not found' });
    reply.send(await historyQueries.getFleetParticipation(req.params.id));
  });
}

module.exports = historyRoutes;
