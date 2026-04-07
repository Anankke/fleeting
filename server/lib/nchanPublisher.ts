const NCHAN_PUB_BASE = process.env.NCHAN_PUB_URL ?? 'http://localhost/pub/fleet';

export async function publish(channelId: string, data: unknown): Promise<void> {
  const url = `${NCHAN_PUB_BASE}/${encodeURIComponent(channelId)}`;
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(data),
  });
  if (!res.ok) {
    console.warn(`[nchan] Publish to ${channelId} returned ${res.status}`);
  }
}
