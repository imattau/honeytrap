import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NostrEvent } from '../src/nostr/types';
import type { P2PSettings } from '../src/storage/types';

const fetchEventPackage = vi.fn(async () => ({ id: 'ok' }));

vi.mock('../src/p2p/eventAssist', async () => {
  const actual = await vi.importActual<any>('../src/p2p/eventAssist');
  return {
    ...actual,
    fetchEventPackage
  };
});

function makeEvent(tags: string[][]): NostrEvent {
  return {
    id: 'evt',
    pubkey: 'pub',
    created_at: Math.floor(Date.now() / 1000),
    kind: 1,
    tags,
    content: 'hello',
    sig: 'sig'
  };
}

function makeSettings(patch: Partial<P2PSettings> = {}): P2PSettings {
  return {
    enabled: true,
    scope: 'follows',
    preferMedia: true,
    preferEvents: true,
    maxConcurrent: 5,
    maxFileSizeMb: 50,
    seedWhileOpen: true,
    trackers: ['wss://tracker.example'],
    ...patch
  };
}

describe('EventAssistService', () => {
  beforeEach(() => {
    fetchEventPackage.mockClear();
  });

  it('fetches event package when magnet present and allowed', async () => {
    const { EventAssistService } = await import('../src/p2p/eventAssistService');
    const service = new EventAssistService(makeSettings());
    await service.maybeAssist(makeEvent([['bt', 'magnet:1', 'event']]), true);
    expect(fetchEventPackage).toHaveBeenCalledTimes(1);
  });

  it('skips when preferEvents disabled', async () => {
    const { EventAssistService } = await import('../src/p2p/eventAssistService');
    const service = new EventAssistService(makeSettings({ preferEvents: false }));
    await service.maybeAssist(makeEvent([['bt', 'magnet:1', 'event']]), true);
    expect(fetchEventPackage).toHaveBeenCalledTimes(0);
  });
});
