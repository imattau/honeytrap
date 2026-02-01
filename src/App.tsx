import React, { useEffect, useRef, useState } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { BrowserRouter, Route, Routes, useNavigate, useLocation } from 'react-router-dom';
import { AppStateProvider, useAppState } from './ui/AppState';
import { Drawer } from './ui/Drawer';
import { PostCard } from './ui/PostCard';
import { ThreadStack } from './ui/ThreadStack';
import { AuthorView } from './ui/AuthorView';
import { HashtagView } from './ui/HashtagView';
import { FabButton } from './ui/FabButton';
import { Composer } from './ui/Composer';
import type { NostrEvent } from './nostr/types';

const FEED_SCROLL_KEY = 'honeytrap:feed-scroll-top';

function Feed() {
  const {
    events,
    profiles,
    selectEvent,
    loadOlder,
    flushPending,
    feedLoading,
    pendingCount,
    publishPost,
    publishReply,
    mediaRelayList,
    settings,
    attachMedia,
    setPaused
  } = useAppState();
  const [composerOpen, setComposerOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<NostrEvent | undefined>(undefined);
  const navigate = useNavigate();
  const location = useLocation();
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const [pullDistance, setPullDistance] = React.useState(0);
  const [pullReady, setPullReady] = React.useState(false);
  const pullStartRef = useRef<number | null>(null);
  const wheelPullRef = useRef<number>(0);
  const wheelTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setPaused(false);
    return () => {
      setPaused(true);
    };
  }, [setPaused]);

  useEffect(() => {
    if (location.pathname !== '/') return;
    const stored = sessionStorage.getItem(FEED_SCROLL_KEY);
    if (!stored) return;
    const top = Number(stored);
    if (!Number.isFinite(top)) return;
    requestAnimationFrame(() => {
      virtuosoRef.current?.scrollTo({ top, behavior: 'auto' });
    });
  }, [location.pathname]);

  useEffect(() => {
    return () => {
      if (scrollerRef.current) {
        sessionStorage.setItem(FEED_SCROLL_KEY, String(scrollerRef.current.scrollTop));
      }
    };
  }, []);

  return (
    <div
      className="feed-shell"
      onTouchStart={(event) => {
        const scroller = scrollerRef.current;
        if (!scroller || scroller.scrollTop > 0) return;
        pullStartRef.current = event.touches[0]?.clientY ?? null;
      }}
      onTouchMove={(event) => {
        if (pullStartRef.current === null) return;
        const current = event.touches[0]?.clientY ?? pullStartRef.current;
        const distance = Math.max(0, current - pullStartRef.current);
        const capped = Math.min(distance, 120);
        setPullDistance(capped);
        setPullReady(capped > 70);
        if (capped > 0) event.preventDefault();
      }}
      onTouchEnd={() => {
        if (pullReady) flushPending();
        pullStartRef.current = null;
        setPullDistance(0);
        setPullReady(false);
      }}
      onWheel={(event) => {
        const scroller = scrollerRef.current;
        if (!scroller || scroller.scrollTop > 0) return;
        if (event.deltaY >= 0) return;
        const next = Math.min(120, wheelPullRef.current + Math.abs(event.deltaY));
        wheelPullRef.current = next;
        setPullDistance(next);
        const ready = next > 70;
        setPullReady(ready);
        if (wheelTimerRef.current) window.clearTimeout(wheelTimerRef.current);
        wheelTimerRef.current = window.setTimeout(() => {
          if (wheelPullRef.current > 70) flushPending();
          wheelPullRef.current = 0;
          setPullDistance(0);
          setPullReady(false);
        }, 220);
      }}
    >
      <div
        className={`progress-line ${feedLoading || pendingCount > 0 ? 'active' : ''} ${pendingCount > 0 ? 'pulse' : ''}`}
        aria-hidden="true"
      />
      <div className={`feed-pull ${pullReady ? 'ready' : ''}`} style={{ height: pullDistance }}>
        <span>{pullReady ? 'Release to load new posts' : 'Pull to refresh'}</span>
      </div>
      <Virtuoso
        ref={virtuosoRef}
        scrollerRef={(node) => {
          scrollerRef.current = node instanceof HTMLElement ? node : null;
        }}
        className="feed-virtuoso"
        data={events}
        overscan={600}
        endReached={() => loadOlder().catch(() => null)}
        itemContent={(_, event) => (
          <div className="feed-item">
            <PostCard
              event={event}
              profile={profiles[event.pubkey]}
              onSelect={selectEvent}
              onOpenThread={() => navigate(`/thread/${event.id}`, { state: { event } })}
              showActions
              actionsPosition="top"
              onReply={() => {
                setReplyTarget(event);
                setComposerOpen(true);
              }}
            />
          </div>
        )}
      />
      <FabButton
        onClick={() => {
          setReplyTarget(undefined);
          setComposerOpen(true);
        }}
      />
      <Composer
        open={composerOpen}
        replyTo={replyTarget}
        onClose={() => {
          setComposerOpen(false);
          setReplyTarget(undefined);
        }}
        onSubmit={(input) => (replyTarget ? publishReply(input, replyTarget) : publishPost(input))}
        mediaRelays={mediaRelayList.length > 0 ? mediaRelayList : settings.mediaRelays}
        onAttachMedia={attachMedia}
      />
    </div>
  );
}

function AppRoutes() {
  const location = useLocation();
  return (
    <Routes location={location} key={location.pathname}>
      <Route path="/" element={<Feed />} />
      <Route path="/thread/:id" element={<ThreadStack />} />
      <Route path="/author/:pubkey" element={<AuthorView />} />
      <Route path="/tag/:tag" element={<HashtagView />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AppStateProvider>
      <BrowserRouter>
        <div className="app-shell">
          <Drawer />
          <AppRoutes />
        </div>
      </BrowserRouter>
    </AppStateProvider>
  );
}
