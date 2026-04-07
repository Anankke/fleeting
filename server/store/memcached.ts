import Memcached from 'memcached';

const client = new Memcached(
  `${process.env.MEMCACHED_HOST ?? 'localhost'}:${process.env.MEMCACHED_PORT ?? 11211}`,
  { timeout: 1000, retries: 2, reconnect: 5000 },
);

export function get<T = unknown>(key: string): Promise<T | null> {
  return new Promise((resolve) => {
    client.get(key, (_err, data) => {
      if (data === undefined || data === null) return resolve(null);
      try {
        resolve(JSON.parse(data as string) as T);
      } catch {
        resolve(null);
      }
    });
  });
}

export function set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  return new Promise((resolve, reject) => {
    client.set(key, JSON.stringify(value), ttlSeconds, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

export function del(key: string): Promise<void> {
  return new Promise((resolve) => {
    client.del(key, () => resolve());
  });
}

export { client };
