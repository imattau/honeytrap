import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Hash } from 'lucide-react';
import type { NostrEvent } from '../nostr/types';
import { useAppState } from './AppState';
import { PostCard } from './PostCard';

export function HashtagView() {
  const { tag } = useParams<{ tag: string }>();
  const navigate = useNavigate();
  const { hashtagService, profiles, selectEvent } = useAppState();
  const [events, setEvents] = useState<NostrEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const eventsRef = useRef<NostrEvent[]>([]);

  const normalized = useMemo(() => (tag ?? '').replace(/^#/, '').toLowerCase(), [tag]);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  useEffect(() => {
    if (!normalized) return;
    hashtagService.subscribeHashtagFeed(
      normalized,
      () => eventsRef.current,
      (next) => {
        setEvents(next);
        if (next.length > 0) setLoading(false);
      },
      () => null
    );
    return () => {
      hashtagService.stop();
      setEvents([]);
      setLoading(true);
    };
  }, [hashtagService, normalized]);

  return (
    <div className="author-view">
      <div className={`progress-line ${loading ? 'active' : ''}`} aria-hidden="true" />
      <div className="author-header">
        <button className="author-back" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft size={18} />
        </button>
        <div className="author-card">
          <div className="author-avatar fallback">
            <Hash size={18} />
          </div>
          <div>
            <div className="author-name">#{normalized || 'tag'}</div>
            <div className="author-sub">Hashtag feed</div>
          </div>
        </div>
      </div>
      <Virtuoso
        className="feed-virtuoso"
        data={events}
        overscan={600}
        components={{
          EmptyPlaceholder: () => (
            <div className="author-empty">
              {loading ? 'Loading posts…' : 'No posts yet.'}
            </div>
          )
        }}
        endReached={() => normalized ? hashtagService.loadOlder(normalized, () => eventsRef.current, setEvents) : Promise.resolve()}
        itemContent={(_, event) => (
          <div className="feed-item">
            <PostCard
              event={event}
              profile={profiles[event.pubkey]}
              onSelect={selectEvent}
              onOpenThread={() => navigate(`/thread/${event.id}`, { state: { event } })}
              showActions
              actionsPosition="top"
            />
          </div>
        )}
      />
    </div>
  );
}
