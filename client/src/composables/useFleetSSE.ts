/**
 * useFleetSSE.ts
 *
 * Subscribes to a Nchan SSE channel and provides the latest fleet aggregate.
 * Supports multiplexed channels (War Cmdr: id1,id2,id3).
 * Auto-reconnects on disconnect with exponential backoff.
 */

import { ref, onUnmounted, type Ref } from 'vue';

export interface FleetAggregate {
  fleetSessionId: string;
  dpsOut:         number;
  dpsIn:          number;
  logiOut:        number;
  logiIn:         number;
  capTransfered:  number;
  capRecieved:    number;
  capDamageOut:   number;
  capDamageIn:    number;
  mined:          number;
  memberCount:    number;
  hitQualityDistribution: Record<string, number>;
  breakdown:      any[];
  memberSnapshots?: Record<string, any>;
}

export function useFleetSSE(channelIds: Ref<string[]>) {
  const aggregate   = ref<FleetAggregate | null>(null);
  const connected   = ref(false);
  const error       = ref<string | null>(null);
  let   evtSource:  EventSource | null = null;
  let   retryTimer: ReturnType<typeof setTimeout> | null = null;
  let   retryDelay  = 1000;

  function connect() {
    if (!channelIds.value.length) return;
    const ids = channelIds.value.join(',');
    const url = `/sub/fleet/${encodeURIComponent(ids)}`;

    evtSource = new EventSource(url);

    evtSource.onopen = () => {
      connected.value = true;
      error.value     = null;
      retryDelay      = 1000;
    };

    evtSource.onmessage = (evt) => {
      try {
        aggregate.value = JSON.parse(evt.data) as FleetAggregate;
      } catch {
        // Ignore malformed messages
      }
    };

    evtSource.onerror = () => {
      connected.value = false;
      evtSource?.close();
      evtSource = null;
      scheduleRetry();
    };
  }

  function scheduleRetry() {
    if (retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      retryDelay = Math.min(retryDelay * 2, 30_000);
      connect();
    }, retryDelay);
  }

  function disconnect() {
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    evtSource?.close();
    evtSource = null;
    connected.value = false;
  }

  onUnmounted(disconnect);

  return { aggregate, connected, error, connect, disconnect };
}
