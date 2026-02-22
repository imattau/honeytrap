import type { NostrEvent } from '../nostr/types';

export type NotificationFilter = 'all' | 'mentions' | 'reactions' | 'zaps';
export type NotificationKindFilter = Exclude<NotificationFilter, 'all'>;

export interface NotificationSummary {
  totals: Record<NotificationFilter, number>;
  unread: Record<NotificationFilter, number>;
}

const EMPTY_COUNTS: Record<NotificationFilter, number> = {
  all: 0,
  mentions: 0,
  reactions: 0,
  zaps: 0
};

export function notificationFilterForKind(kind: number): NotificationKindFilter | undefined {
  if (kind === 1) return 'mentions';
  if (kind === 7) return 'reactions';
  if (kind === 9735) return 'zaps';
  return undefined;
}

export function eventMatchesNotificationFilter(event: NostrEvent, filter: NotificationFilter): boolean {
  if (filter === 'all') return true;
  return notificationFilterForKind(event.kind) === filter;
}

export function filterNotifications(events: NostrEvent[], filter: NotificationFilter): NostrEvent[] {
  if (filter === 'all') return events;
  return events.filter((event) => eventMatchesNotificationFilter(event, filter));
}

export function summarizeNotifications(events: NostrEvent[], lastReadAt: number): NotificationSummary {
  const totals: Record<NotificationFilter, number> = { ...EMPTY_COUNTS };
  const unread: Record<NotificationFilter, number> = { ...EMPTY_COUNTS };
  for (const event of events) {
    totals.all += 1;
    const isUnread = event.created_at > lastReadAt;
    if (isUnread) unread.all += 1;
    const byKind = notificationFilterForKind(event.kind);
    if (!byKind) continue;
    totals[byKind] += 1;
    if (isUnread) unread[byKind] += 1;
  }
  return { totals, unread };
}

export function notificationsLastReadKey(npub: string): string {
  return `honeytrap:notifications:last-read:${npub}`;
}

export function readStoredLastReadAt(storageValue: string | null): number {
  if (!storageValue) return 0;
  const parsed = Number(storageValue);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}
