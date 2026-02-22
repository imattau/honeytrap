import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { NostrEvent } from '../nostr/types';
import { useAppState } from './AppState';
import { PostCard } from './PostCard';
import { openThread } from './threadNavigation';
import { dedupeEvents } from './utils';
import { EmptyState } from './EmptyState';
import {
  filterNotifications,
  notificationsLastReadKey,
  readStoredLastReadAt,
  summarizeNotifications,
  type NotificationFilter
} from './notifications';

const FILTERS: Array<{ id: NotificationFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'mentions', label: 'Mentions' },
  { id: 'reactions', label: 'Reactions' },
  { id: 'zaps', label: 'Zaps' }
];
const FILTER_EMPTY_LABEL: Record<NotificationFilter, string> = {
  all: 'notifications',
  mentions: 'mentions',
  reactions: 'reactions',
  zaps: 'zaps'
};

export function NotificationsView() {
  const { keys, profiles, fetchMentions, subscribeMentions, hydrateProfiles } = useAppState();
  const navigate = useNavigate();
  const [events, setEvents] = useState<NostrEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [lastReadAt, setLastReadAt] = useState(0);
  const oldestRef = useRef<number | undefined>(undefined);
  const loadingOlderRef = useRef(false);

  useEffect(() => {
    if (!keys?.npub) {
      setLastReadAt(0);
      return;
    }
    const key = notificationsLastReadKey(keys.npub);
    const stored = globalThis.localStorage?.getItem(key) ?? null;
    setLastReadAt(readStoredLastReadAt(stored));
  }, [keys?.npub]);

  const persistLastReadAt = useCallback((next: number) => {
    const normalized = Math.max(0, Math.floor(next));
    setLastReadAt(normalized);
    if (!keys?.npub) return;
    const key = notificationsLastReadKey(keys.npub);
    globalThis.localStorage?.setItem(key, String(normalized));
  }, [keys?.npub]);

  useEffect(() => {
    if (!keys?.npub) {
      setEvents([]);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    fetchMentions(keys.npub, { limit: 80 })
      .then((loaded) => {
        if (!active) return;
        const sorted = dedupeEvents(loaded);
        setEvents(sorted);
        hydrateProfiles(sorted.map((event) => event.pubkey)).catch(() => null);
        oldestRef.current = sorted[sorted.length - 1]?.created_at;
      })
      .catch(() => null)
      .finally(() => {
        if (active) setLoading(false);
      });

    let unsubscribe: (() => void) | undefined;
    subscribeMentions(
      keys.npub,
      (event) => {
        if (!active) return;
        setEvents((prev) => dedupeEvents([event, ...prev]));
        hydrateProfiles([event.pubkey]).catch(() => null);
      },
      () => null
    ).then((close) => {
      unsubscribe = close;
    }).catch(() => null);

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [fetchMentions, hydrateProfiles, keys?.npub, subscribeMentions]);

  const summary = useMemo(
    () => summarizeNotifications(events, lastReadAt),
    [events, lastReadAt]
  );
  const filtered = useMemo(
    () => filterNotifications(events, filter),
    [events, filter]
  );
  const subtitle = useMemo(() => {
    if (!keys?.npub) return 'Sign in to view notifications';
    if (summary.unread.all === 0) return 'Mentions, reactions, and zaps';
    return `${summary.unread.all} unread · Mentions, reactions, and zaps`;
  }, [keys?.npub, summary.unread.all]);

  const markAllRead = useCallback(() => {
    const latestSeen = events[0]?.created_at ?? Math.floor(Date.now() / 1000);
    persistLastReadAt(latestSeen);
  }, [events, persistLastReadAt]);

  const loadOlder = async () => {
    if (!keys?.npub || loadingOlderRef.current || !oldestRef.current) return;
    loadingOlderRef.current = true;
    try {
      const older = await fetchMentions(keys.npub, { until: oldestRef.current - 1, limit: 50 });
      hydrateProfiles(older.map((event) => event.pubkey)).catch(() => null);
      setEvents((prev) => {
        const merged = dedupeEvents([...prev, ...older]);
        oldestRef.current = merged[merged.length - 1]?.created_at;
        return merged;
      });
    } finally {
      loadingOlderRef.current = false;
    }
  };

  return (
    <div className="notifications-view">
      <div className={`progress-line ${loading ? 'active' : ''}`} aria-hidden="true" />
      <div className="notifications-header">
        <div className="notifications-title"><Bell size={18} /> Notifications</div>
        <div className="notifications-sub">{subtitle}</div>
      </div>
      <div className="notifications-controls">
        <div className="notifications-filters">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`notifications-filter-pill ${filter === item.id ? 'active' : ''}`}
              onClick={() => setFilter(item.id)}
            >
              <span>{item.label}</span>
              <span className="notifications-filter-count">{summary.totals[item.id]}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="notifications-read-button"
          onClick={markAllRead}
          disabled={!keys?.npub || summary.unread.all === 0}
        >
          Mark all read{summary.unread.all > 0 ? ` (${summary.unread.all})` : ''}
        </button>
      </div>
      <Virtuoso
        className="feed-virtuoso"
        data={filtered}
        computeItemKey={(_, event) => event.id}
        endReached={() => loadOlder().catch(() => null)}
        itemContent={(_, event) => (
          <div className={`feed-item notification-feed-item ${event.created_at > lastReadAt ? 'is-unread' : ''}`}>
            {event.created_at > lastReadAt && <span className="notification-chip">new</span>}
            <PostCard
              event={event}
              profile={profiles[event.pubkey]}
              onOpenThread={() => openThread(navigate, event)}
              showActions
            />
          </div>
        )}
        components={{
          EmptyPlaceholder: () => (
            <EmptyState
              title={loading ? 'Loading notifications…' : (keys?.npub ? 'No notifications found' : 'Sign in required')}
              message={
                loading
                  ? 'Fetching mentions and reactions.'
                  : (keys?.npub
                    ? (events.length === 0
                      ? 'You have no new interactions.'
                      : `No ${FILTER_EMPTY_LABEL[filter]} in this view.`)
                    : 'Please sign in to view your notifications.')
              }
              loading={loading}
              icon={Bell}
              actionLabel={!loading && keys?.npub ? 'Back to feed' : undefined}
              onAction={() => navigate('/')}
            />
          )
        }}
      />
    </div>
  );
}
