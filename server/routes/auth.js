'use strict';

const { oidcLogin, oidcCallback, requireAuth } = require('../lib/auth');

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
async function authRoutes(fastify) {
  // GET /auth/login — redirect to OIDC provider
  fastify.get('/auth/login', oidcLogin);

  // GET /auth/callback — OIDC redirect URI
  fastify.get('/auth/callback', oidcCallback);

  // POST /auth/logout — destroy session
  fastify.post('/auth/logout', { preHandler: requireAuth }, async (req, reply) => {
    await req.session.destroy();
    reply.send({ ok: true });
  });

  // GET /api/me — current session info
  fastify.get('/api/me', { preHandler: requireAuth }, async (req, reply) => {
    reply.send({
      userId:     req.session.userId,
      name:       req.session.name,
      roles:      req.session.roles ?? [],
      characters: req.session.characters ?? [],
    });
  });

  // GET /api/nchan/auth — Nchan authorize_request callback
  // Nchan calls this for every new SSE subscriber.
  fastify.get('/api/nchan/auth', async (req, reply) => {
    if (req.session.userId) {
      reply.code(200).send('OK');
    } else {
      reply.code(403).send('Forbidden');
    }
  });
}

module.exports = authRoutes;
