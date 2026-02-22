import React, { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Virtuoso } from 'react-virtuoso';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Hash } from 'lucide-react';
import type { NostrEvent, ProfileMetadata } from '../nostr/types';
import { useAppState } from './AppState';
import { PostCard } from './PostCard';
import { Composer } from './Composer';
import { openThread } from './threadNavigation';

const LOADING_FALLBACK_MS = 1800;

function sameEventList(left: NostrEvent[], right: NostrEvent[]) {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i]?.id !== right[i]?.id) return false;
    if (left[i]?.created_at !== right[i]?.created_at) return false;
  }
  return true;
}

export function HashtagView() {
  const { tag } = useParams<{ tag: string }>();
  const navigate = useNavigate();
  const { hashtagService, profiles, selectEvent, publishReply, mediaRelayList, settings, attachMedia, mergeProfiles } = useAppState();
  const [events, setEvents] = useState<NostrEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const eventsRef = useRef<NostrEvent[]>([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<NostrEvent | undefined>(undefined);

  const normalized = useMemo(() => (tag ?? '').replace(/^#/, '').toLowerCase(), [tag]);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  const applyEvents = (next: NostrEvent[], resolveLoading = false) => {
    const current = eventsRef.current;
    if (sameEventList(current, next)) {
      if (resolveLoading || next.length > 0) setLoading(false);
      return;
    }
    eventsRef.current = next;
    setEvents(next);
    if (resolveLoading || next.length > 0) setLoading(false);
  };

  useEffect(() => {
    if (!normalized) {
      eventsRef.current = [];
      setEvents([]);
      setLoading(false);
      return;
    }
    eventsRef.current = [];
    setEvents([]);
    setLoading(true);
    let active = true;
    const handleProfiles = (incoming: Record<string, ProfileMetadata>) => {
      if (!active) return;
      mergeProfiles(incoming);
    };
    const fallbackTimer = globalThis.setTimeout(() => {
      if (active) setLoading(false);
    }, LOADING_FALLBACK_MS);
    hashtagService.subscribeHashtagFeed(
      normalized,
      () => eventsRef.current,
      (next) => {
        if (!active) return;
        applyEvents(next);
      },
      handleProfiles
    );
    hashtagService.primeHashtagFeed(
      normalized,
      () => eventsRef.current,
      (next) => {
        if (!active) return;
        applyEvents(next, true);
      },
      handleProfiles
    ).catch(() => null)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      globalThis.clearTimeout(fallbackTimer);
      hashtagService.stop();
    };
  }, [hashtagService, mergeProfiles, normalized]);

  return (
    <div className="author-view">
      <div className={`progress-line ${loading ? 'active' : ''}`} aria-hidden="true" />
      <div className="author-header">
        <button className="author-back" onClick={() => {
          const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
          if (idx > 0) { flushSync(() => navigate(-1)); } else { flushSync(() => navigate('/')); }
        }} aria-label="Back">
          <ArrowLeft size={18} />
        </button>
        <div className="author-card-root">
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
        computeItemKey={(_, event) => event.id}
        overscan={600}
        components={{
          EmptyPlaceholder: () => (
            <div className="author-empty">
              {loading ? 'Loading posts…' : 'No posts yet.'}
            </div>
          )
        }}
        endReached={() => normalized
          ? hashtagService.loadOlder(
            normalized,
            () => eventsRef.current,
            (next) => applyEvents(next),
            (incoming) => mergeProfiles(incoming)
          )
          : Promise.resolve()}
        itemContent={(_, event) => (
          <div className="feed-item">
            <PostCard
              event={event}
              profile={profiles[event.pubkey]}
              onSelect={selectEvent}
              onOpenThread={() => openThread(navigate, event)}
              showActions
              onReply={() => {
                setReplyTarget(event);
                setComposerOpen(true);
              }}
            />
          </div>
        )}
      />
      <Composer
        open={composerOpen}
        replyTo={replyTarget}
        onClose={() => {
          setComposerOpen(false);
          setReplyTarget(undefined);
        }}
        onSubmit={(input) => (replyTarget ? publishReply(input, replyTarget) : Promise.resolve())}
        mediaRelays={mediaRelayList.length > 0 ? mediaRelayList : settings.mediaRelays}
        onAttachMedia={attachMedia}
      />
    </div>
  );
}
