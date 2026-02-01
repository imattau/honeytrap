import React, { useEffect, useRef } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { BrowserRouter, Route, Routes, useNavigate, useLocation } from 'react-router-dom';
import { AppStateProvider, useAppState } from './ui/AppState';
import { Drawer } from './ui/Drawer';
import { PostCard } from './ui/PostCard';
import { ThreadStack } from './ui/ThreadStack';
import { AuthorView } from './ui/AuthorView';

const FEED_SCROLL_KEY = 'honeytrap:feed-scroll-top';

function Feed() {
  const { events, profiles, selectEvent, loadOlder, flushPending, feedLoading, pendingCount } = useAppState();
  const navigate = useNavigate();
  const location = useLocation();
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const [pullDistance, setPullDistance] = React.useState(0);
  const [pullReady, setPullReady] = React.useState(false);
  const pullStartRef = useRef<number | null>(null);

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
            />
          </div>
        )}
      />
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Feed />} />
      <Route path="/thread/:id" element={<ThreadStack />} />
      <Route path="/author/:pubkey" element={<AuthorView />} />
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
