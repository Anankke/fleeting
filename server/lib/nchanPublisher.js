'use strict';

/**
 * server/lib/nchanPublisher.js
 *
 * Publishes a JSON message to a Nchan channel via an internal HTTP POST.
 */

const NCHAN_PUB_BASE = process.env.NCHAN_PUB_URL || 'http://localhost/pub/fleet';

/**
 * Publish data to a fleet channel.
 * @param {string} channelId — fleet session UUID
 * @param {Object} data
 */
async function publish(channelId, data) {
  const url = `${NCHAN_PUB_BASE}/${channelId}`;
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(data),
  });
  if (!res.ok) {
    // Non-fatal — log but continue
    console.warn(`[nchan] Publish to ${channelId} returned ${res.status}`);
  }
}

module.exports = { publish };
