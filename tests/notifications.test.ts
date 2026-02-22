import { describe, expect, it } from 'vitest';
import type { NostrEvent } from '../src/nostr/types';
import {
  filterNotifications,
  notificationFilterForKind,
  notificationsLastReadKey,
  readStoredLastReadAt,
  summarizeNotifications
} from '../src/ui/notifications';

function makeEvent(id: string, kind: number, createdAt: number): NostrEvent {
  return {
    id,
    kind,
    pubkey: 'author',
    created_at: createdAt,
    content: '',
    tags: [],
    sig: 'sig'
  };
}

describe('notifications helpers', () => {
  it('maps supported kinds to notification filters', () => {
    expect(notificationFilterForKind(1)).toBe('mentions');
    expect(notificationFilterForKind(7)).toBe('reactions');
    expect(notificationFilterForKind(9735)).toBe('zaps');
    expect(notificationFilterForKind(30023)).toBeUndefined();
  });

  it('filters events by selected notification tab', () => {
    const events = [
      makeEvent('m1', 1, 100),
      makeEvent('r1', 7, 90),
      makeEvent('z1', 9735, 80),
      makeEvent('x1', 30023, 70)
    ];

    expect(filterNotifications(events, 'all').map((event) => event.id)).toEqual(['m1', 'r1', 'z1', 'x1']);
    expect(filterNotifications(events, 'mentions').map((event) => event.id)).toEqual(['m1']);
    expect(filterNotifications(events, 'reactions').map((event) => event.id)).toEqual(['r1']);
    expect(filterNotifications(events, 'zaps').map((event) => event.id)).toEqual(['z1']);
  });

  it('summarizes totals and unread counts for each filter', () => {
    const events = [
      makeEvent('m-new', 1, 120),
      makeEvent('r-old', 7, 80),
      makeEvent('z-new', 9735, 140),
      makeEvent('x-new', 42, 150)
    ];

    const summary = summarizeNotifications(events, 100);

    expect(summary.totals).toEqual({
      all: 4,
      mentions: 1,
      reactions: 1,
      zaps: 1
    });
    expect(summary.unread).toEqual({
      all: 3,
      mentions: 1,
      reactions: 0,
      zaps: 1
    });
  });

  it('parses persisted read timestamps defensively', () => {
    expect(readStoredLastReadAt(null)).toBe(0);
    expect(readStoredLastReadAt('')).toBe(0);
    expect(readStoredLastReadAt('abc')).toBe(0);
    expect(readStoredLastReadAt('-5')).toBe(0);
    expect(readStoredLastReadAt('123.9')).toBe(123);
  });

  it('builds stable storage keys per user', () => {
    expect(notificationsLastReadKey('npub123')).toBe('honeytrap:notifications:last-read:npub123');
  });
});
