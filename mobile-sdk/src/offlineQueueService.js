/**
 * OfflineQueueService (M-10)
 * Offline Storage Queue with Idempotent Replay for Mobile (React Native / Flutter / Android / iOS).
 *
 * Responsibilities:
 * 1. Maintain a persistent local queue (SQLite / MMKV / IndexedDB / in-memory adapter) for actions taken while offline.
 * 2. Enqueue emergency SOS triggers and continuous coordinate breadcrumbs during connectivity blackouts.
 * 3. Listen to network connectivity transitions (offline -> online).
 * 4. Flush the queue sequentially with FIFO ordering when connectivity returns.
 * 5. REUSE original client UUID v4 so the backend idempotent pipeline (BE-06) drops duplicates cleanly.
 */
class OfflineQueueService {
  constructor(options = {}) {
    this.apiBaseUrl = options.apiBaseUrl || 'https://api.wana.app';
    this.storageAdapter = options.storageAdapter || new InMemoryQueueStore();
    this.isOnline = options.isOnline !== undefined ? options.isOnline : true;
    this.authToken = options.authToken || null;
    this.onQueueFlushed = options.onQueueFlushed || null;
    this.onItemReplayed = options.onItemReplayed || null;
    this.onError = options.onError || null;

    this.isFlushing = false;
  }

  /**
   * Set network connectivity state. Triggers auto-flush when switching to online.
   */
  async setOnline(isOnline, httpClient = null) {
    const wasOffline = !this.isOnline;
    this.isOnline = Boolean(isOnline);

    if (wasOffline && this.isOnline) {
      return await this.flushQueue(httpClient);
    }
    return { flushed: 0, pending: await this.storageAdapter.count() };
  }

  /**
   * Enqueue an emergency SOS trigger when offline.
   * Guarantees persistence of client-generated UUID v4.
   */
  async enqueueSosTrigger(sosPayload) {
    if (!sosPayload.eventId) {
      throw new Error('Offline SOS payload must contain an idempotent eventId (UUID v4)');
    }

    const queueItem = {
      id: `queue_sos_${sosPayload.eventId}`,
      type: 'SOS_TRIGGER',
      endpoint: '/events/sos',
      method: 'POST',
      payload: sosPayload,
      timestamp: Date.now(),
      attempts: 0,
    };

    await this.storageAdapter.enqueue(queueItem);
    return { enqueued: true, item: queueItem };
  }

  /**
   * Enqueue a location heartbeat / breadcrumb when offline.
   */
  async enqueueHeartbeat(eventId, locationData) {
    const queueItem = {
      id: `queue_heartbeat_${eventId}_${Date.now()}`,
      type: 'HEARTBEAT',
      endpoint: `/events/${eventId}/heartbeat`,
      method: 'POST',
      payload: locationData,
      timestamp: Date.now(),
      attempts: 0,
    };

    await this.storageAdapter.enqueue(queueItem);
    return { enqueued: true, item: queueItem };
  }

  /**
   * Flush queue sequentially upon connection restoration.
   */
  async flushQueue(httpClient = null) {
    if (this.isFlushing || !this.isOnline) {
      return { flushed: 0, pending: await this.storageAdapter.count() };
    }

    this.isFlushing = true;
    let flushedCount = 0;

    try {
      while (await this.storageAdapter.count() > 0) {
        const item = await this.storageAdapter.peek();
        if (!item) break;

        try {
          const replayResult = await this.replayItem(item, httpClient);
          await this.storageAdapter.dequeue(); // Successfully dispatched
          flushedCount++;

          if (this.onItemReplayed) {
            this.onItemReplayed(item, replayResult);
          }
        } catch (err) {
          item.attempts = (item.attempts || 0) + 1;
          if (this.onError) {
            this.onError(err, item);
          }
          // Pause flush if network dropped again
          break;
        }
      }
    } finally {
      this.isFlushing = false;
    }

    const remaining = await this.storageAdapter.count();
    if (this.onQueueFlushed) {
      this.onQueueFlushed({ flushed: flushedCount, remaining });
    }

    return { flushed: flushedCount, remaining };
  }

  /**
   * Replay an individual queued action to the backend.
   */
  async replayItem(item, httpClient = null) {
    if (httpClient) {
      return await httpClient.request({
        url: `${this.apiBaseUrl}${item.endpoint}`,
        method: item.method,
        data: item.payload,
      });
    }

    const response = await fetch(`${this.apiBaseUrl}${item.endpoint}`, {
      method: item.method,
      headers: {
        'Content-Type': 'application/json',
        ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
      },
      body: JSON.stringify(item.payload),
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(errBody.error?.message || `HTTP ${response.status} during offline replay`);
    }

    return await response.json();
  }

  async getPendingCount() {
    return await this.storageAdapter.count();
  }
}

/**
 * InMemoryQueueStore: Default robust in-memory SQLite emulator
 */
class InMemoryQueueStore {
  constructor() {
    this.items = [];
  }

  async enqueue(item) {
    this.items.push(item);
  }

  async peek() {
    return this.items[0] || null;
  }

  async dequeue() {
    return this.items.shift() || null;
  }

  async count() {
    return this.items.length;
  }

  async clear() {
    this.items = [];
  }
}

module.exports = { OfflineQueueService, InMemoryQueueStore };
