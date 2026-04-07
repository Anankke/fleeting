'use strict';

const Memcached = require('memcached');

const client = new Memcached(
  `${process.env.MEMCACHED_HOST || 'localhost'}:${process.env.MEMCACHED_PORT || 11211}`,
  { timeout: 1000, retries: 2, reconnect: 5000 }
);

/**
 * Get a JSON value from Memcached.
 * @param {string} key
 * @returns {Promise<any|null>}
 */
function get(key) {
  return new Promise((resolve) => {
    client.get(key, (err, data) => {
      if (err || data === undefined) return resolve(null);
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve(null);
      }
    });
  });
}

/**
 * Set a JSON value in Memcached.
 * @param {string} key
 * @param {any} value
 * @param {number} ttlSeconds
 */
function set(key, value, ttlSeconds) {
  return new Promise((resolve, reject) => {
    client.set(key, JSON.stringify(value), ttlSeconds, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

/**
 * Delete a key from Memcached.
 * @param {string} key
 */
function del(key) {
  return new Promise((resolve) => {
    client.del(key, () => resolve());
  });
}

module.exports = { get, set, del, client };
