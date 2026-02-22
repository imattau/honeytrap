import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { NostrEvent } from '../nostr/types';
import { useAppState } from './AppState';
import { PostCard } from './PostCard';
import { openThread } from './threadNavigation';
import { dedupeEvents } from './utils';
import { EmptyState } from './EmptyState';

export function NotificationsView() {
  const { keys, profiles, fetchMentions, subscribeMentions, hydrateProfiles } = useAppState();
  const navigate = useNavigate();
  const [events, setEvents] = useState<NostrEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const oldestRef = useRef<number | undefined>(undefined);
  const loadingOlderRef = useRef(false);

  const title = useMemo(() => {
    if (!keys?.npub) return 'Sign in to view notifications';
    return 'Mentions, reactions, and zaps';
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
        <div className="notifications-sub">{title}</div>
      </div>
      <Virtuoso
        className="feed-virtuoso"
        data={events}
        computeItemKey={(_, event) => event.id}
        endReached={() => loadOlder().catch(() => null)}
        itemContent={(_, event) => (
          <div className="feed-item">
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
              title={loading ? 'Loading notifications…' : (keys?.npub ? 'No notifications yet' : 'Sign in required')}
              message={loading ? 'Fetching mentions and reactions.' : (keys?.npub ? 'You have no new interactions.' : 'Please sign in to view your notifications.')}
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
