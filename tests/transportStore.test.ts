import { describe, it, expect, vi } from 'vitest';
import { TransportStore } from '../src/nostr/transport';

describe('TransportStore', () => {
  it('notifies keyed subscribers only for their event id', () => {
    const store = new TransportStore();
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = store.subscribeKey('event-a', a);
    const unsubB = store.subscribeKey('event-b', b);

    store.mark('event-a', { relay: true });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();

    unsubA();
    store.mark('event-a', { verified: true });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();

    unsubB();
  });

  it('returns a stable empty status for unknown ids', () => {
    const store = new TransportStore();
    const first = store.get('missing');
    const second = store.get('missing');
    expect(first).toBe(second);
  });
});
