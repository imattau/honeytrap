import React, { useEffect, useRef, useState } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { BrowserRouter, Route, Routes, useNavigate, useLocation } from 'react-router-dom';
import { AppStateProvider, useAppState, useFeedControlState } from './ui/AppState';
import { Drawer } from './ui/Drawer';
import { PostCard } from './ui/PostCard';
import { ThreadStack } from './ui/ThreadStack';
import { AuthorView } from './ui/AuthorView';
import { HashtagView } from './ui/HashtagView';
import { LongFormView } from './ui/LongFormView';
import { FabButton } from './ui/FabButton';
import { Composer } from './ui/Composer';
import { P2PStatusBar } from './ui/P2PStatusBar';
import { openThread } from './ui/threadNavigation';
import type { NostrEvent } from './nostr/types';
import { SearchView } from './ui/SearchView';
import { NotificationsView } from './ui/NotificationsView';
import { ProfileEditView } from './ui/ProfileEditView';
import { ListsView } from './ui/ListsView';

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
    torrents,
    setFeedMode,
    followers,
    following,
    keys
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
  const loadOlderInFlightRef = useRef(false);
  const lastLoadOlderAttemptRef = useRef(0);
  const lastAutoFlushRef = useRef(0);
  const isTouch = window.matchMedia('(pointer: coarse)').matches;

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

  const loadOlderSafe = () => {
    const now = Date.now();
    if (loadOlderInFlightRef.current) return;
    if (now - lastLoadOlderAttemptRef.current < 350) return;
    lastLoadOlderAttemptRef.current = now;
    loadOlderInFlightRef.current = true;
    loadOlder()
      .catch(() => null)
      .finally(() => {
        loadOlderInFlightRef.current = false;
      });
  };

  const flushPendingSafe = () => {
    if (pendingCount <= 0) return;
    const now = Date.now();
    if (now - lastAutoFlushRef.current < 400) return;
    lastAutoFlushRef.current = now;
    flushPending();
  };

  return (
    <div
      className="feed-shell"
      onTouchStart={(event) => {
        if (isInteractiveTarget(event.target)) return;
        const scroller = scrollerRef.current;
        if (!scroller || scroller.scrollTop > 0) return;
        pullStartRef.current = event.touches[0]?.clientY ?? null;
      }}
      onTouchMove={(event) => {
        if (pullStartRef.current === null) return;
        if (isInteractiveTarget(event.target)) {
          pullStartRef.current = null;
          return;
        }
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
        if (isInteractiveTarget(event.target)) return;
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
      <div className="feed-toolbar">
        <div className="feed-mode-switcher">
          <button type="button" className={`feed-mode-pill ${settings.feedMode === 'all' ? 'active' : ''}`} onClick={() => setFeedMode('all')}>
            Global
          </button>
          <button type="button" className={`feed-mode-pill ${settings.feedMode === 'follows' ? 'active' : ''}`} onClick={() => setFeedMode('follows')}>
            Following ({following.length})
          </button>
          <button type="button" className={`feed-mode-pill ${settings.feedMode === 'followers' ? 'active' : ''}`} onClick={() => setFeedMode('followers')}>
            Followers ({followers.length})
          </button>
          <button type="button" className={`feed-mode-pill ${settings.feedMode === 'both' ? 'active' : ''}`} onClick={() => setFeedMode('both')}>
            Both
          </button>
        </div>
        <div className="feed-toolbar-actions">
          <button type="button" className="feed-search-button" onClick={() => navigate('/search')}>
            Search
          </button>
          {!isTouch && pendingCount > 0 && (
            <button type="button" className="feed-pending-button" onClick={() => flushPending()}>
              {pendingCount} new post{pendingCount === 1 ? '' : 's'} - show now
            </button>
          )}
        </div>
      </div>
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
        computeItemKey={(_, event) => event.id}
        overscan={600}
        endReached={() => loadOlderSafe()}
        atBottomStateChange={(atBottom) => {
          if (atBottom) loadOlderSafe();
        }}
        startReached={() => flushPendingSafe()}
        atTopStateChange={(atTop) => {
          if (atTop) flushPendingSafe();
        }}
        components={{
          EmptyPlaceholder: () => (
            <FeedEmptyState
              authed={Boolean(keys?.npub)}
              hasFollows={following.length > 0}
              onSearch={() => navigate('/search')}
            />
          )
        }}
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
      <P2PStatusBar torrents={torrents} enabled={settings.p2p.enabled} />
    </div>
  );
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('button, a, input, textarea, select, summary, [role=\"button\"]'));
}

function AppRoutes() {
  const location = useLocation();
  const { setPaused } = useFeedControlState();
  const [routeLocation, setRouteLocation] = useState(() => currentRouteLocation());

  useEffect(() => {
    ensureHistoryNavigationEvents();
    const update = () => {
      setRouteLocation(currentRouteLocation());
    };
    window.addEventListener('popstate', update);
    window.addEventListener('honeytrap:navigate', update as EventListener);
    return () => {
      window.removeEventListener('popstate', update);
      window.removeEventListener('honeytrap:navigate', update as EventListener);
    };
  }, []);

  useEffect(() => {
    setPaused(routeLocation.pathname !== '/');
  }, [routeLocation.pathname, setPaused]);

  return (
    <Routes location={routeLocation}>
      <Route path="/search" element={<SearchView key={routeLocation.pathname} />} />
      <Route path="/search/" element={<SearchView key={routeLocation.pathname} />} />
      <Route path="/notifications" element={<NotificationsView key={routeLocation.pathname} />} />
      <Route path="/notifications/" element={<NotificationsView key={routeLocation.pathname} />} />
      <Route path="/article/:id" element={<LongFormView key={routeLocation.pathname} />} />
      <Route path="/profile/edit" element={<ProfileEditView key={routeLocation.pathname} />} />
      <Route path="/profile/edit/" element={<ProfileEditView key={routeLocation.pathname} />} />
      <Route path="/lists" element={<ListsView key={routeLocation.pathname} />} />
      <Route path="/lists/" element={<ListsView key={routeLocation.pathname} />} />
      <Route path="/thread/:id" element={<ThreadStack key={routeLocation.pathname} />} />
      <Route path="/author/:pubkey" element={<AuthorView key={routeLocation.pathname} />} />
      <Route path="/tag/:tag" element={<HashtagView key={routeLocation.pathname} />} />
      <Route path="/" element={<Feed />} />
      <Route path="*" element={<Feed />} />
    </Routes>
  );
}

function FeedEmptyState({
  authed,
  hasFollows,
  onSearch
}: {
  authed: boolean;
  hasFollows: boolean;
  onSearch: () => void;
}) {
  return (
    <div className="feed-empty-state">
      {!authed ? (
        <>
          <div className="feed-empty-title">Welcome to Honeytrap</div>
          <div className="feed-empty-copy">Open Menu, sign in with NIP-07/NIP-46, then load your feed.</div>
        </>
      ) : (
        <>
          <div className="feed-empty-title">Your feed is empty</div>
          <div className="feed-empty-copy">{hasFollows ? 'No posts found yet from your selected mode.' : 'Follow people or switch to Global mode to discover posts.'}</div>
        </>
      )}
      <button className="feed-empty-action" onClick={onSearch}>Open search</button>
    </div>
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

function currentRouteLocation() {
  return {
    pathname: normalizePath(window.location.pathname),
    search: window.location.search,
    hash: window.location.hash,
    state: window.history.state,
    key: `${window.location.pathname}${window.location.search}${window.location.hash}`
  };
}

function normalizePath(pathname: string): string {
  if (pathname === '/') return pathname;
  return pathname.replace(/\/+$/, '');
}

function ensureHistoryNavigationEvents() {
  const tag = '__honeytrapHistoryPatched';
  const historyAny = window.history as History & { [tag]?: boolean };
  if (historyAny[tag]) return;
  historyAny[tag] = true;
  const emit = () => window.dispatchEvent(new Event('honeytrap:navigate'));
  const originalPushState = window.history.pushState.bind(window.history);
  const originalReplaceState = window.history.replaceState.bind(window.history);
  window.history.pushState = function pushState(...args) {
    originalPushState(...args);
    emit();
  };
  window.history.replaceState = function replaceState(...args) {
    originalReplaceState(...args);
    emit();
  };
}
