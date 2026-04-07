import type { FastifyInstance } from 'fastify';
import { oidcLogin, oidcCallback, requireAuth } from '../lib/auth.js';

export default async function authRoutes(fastify: FastifyInstance) {
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
    const s = req.session as unknown as Record<string, unknown>;
    reply.send({
      userId:     s['userId'],
      name:       s['name'],
      roles:      s['roles'] ?? [],
      characters: s['characters'] ?? [],
    });
  });

  // GET /api/nchan/auth — Nchan authorize_request callback
  fastify.get('/api/nchan/auth', async (req, reply) => {
    const s = req.session as unknown as Record<string, unknown>;
    if (s['userId']) {
      reply.code(200).send('OK');
    } else {
      reply.code(403).send('Forbidden');
    }
  });
}
