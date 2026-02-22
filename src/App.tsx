import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { VirtuosoGrid, type VirtuosoGridHandle } from 'react-virtuoso';
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
import { EmptyState } from './ui/EmptyState';
import { Search } from 'lucide-react';

import { useAuth } from './ui/state/contexts/AuthContext';
import { useSettings } from './ui/state/contexts/SettingsContext';
import { useSocial } from './ui/state/contexts/SocialContext';
import { useFeed } from './ui/state/contexts/FeedContext';
import { useRelay } from './ui/state/contexts/RelayContext';
import { useP2P } from './ui/state/contexts/P2PContext';

const FEED_SCROLL_KEY = 'honeytrap:feed-scroll-top';

function Feed() {
  const {
    events,
    selectEvent,
    loadOlder,
    flushPending,
    feedLoading,
    pendingCount,
    publishPost,
    publishReply,
    setPaused
  } = useFeed();

  const { keys } = useAuth();
  const { settings, setFeedMode } = useSettings();
  const { followers } = useSocial();
  const following = settings.follows;
  const { mediaRelayList } = useRelay();
  const { torrents, attachMedia } = useP2P();

  const [composerOpen, setComposerOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<NostrEvent | undefined>(undefined);
  const navigate = useNavigate();
  const location = useLocation();
  const virtuosoRef = useRef<VirtuosoGridHandle | null>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const pullRef = useRef<HTMLDivElement | null>(null);
  const pullLabelRef = useRef<HTMLSpanElement | null>(null);
  const pullStartRef = useRef<number | null>(null);
  const pullDistanceRef = useRef(0);
  const pullReadyRef = useRef(false);
  const wheelPullRef = useRef<number>(0);
  const wheelTimerRef = useRef<number | null>(null);
  const loadOlderInFlightRef = useRef(false);
  const lastLoadOlderAttemptRef = useRef(0);
  const lastAutoFlushRef = useRef(0);
  const isTouch = useMemo(() => window.matchMedia('(pointer: coarse)').matches, []);
  const [gridColumns, setGridColumns] = useState(() => getFeedGridColumns(window.innerWidth));

  useEffect(() => {
    if (location.pathname !== '/') return;
    const stored = sessionStorage.getItem(FEED_SCROLL_KEY);
    if (!stored) return;
    const top = Number(stored);
    if (!Number.isFinite(top)) return;
    requestAnimationFrame(() => {
      // VirtuosoGrid scrollTo top is slightly different or might not be needed if session storage works
      // Actually, VirtuosoGrid scrollTo works similarly.
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

  useEffect(() => {
    return () => {
      if (wheelTimerRef.current) window.clearTimeout(wheelTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const onResize = () => {
      const next = getFeedGridColumns(window.innerWidth);
      setGridColumns((prev) => (prev === next ? prev : next));
    };
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
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

  const setPullVisual = useCallback((distance: number) => {
    const capped = Math.min(120, Math.max(0, distance));
    const ready = capped > 70;
    const distanceChanged = pullDistanceRef.current !== capped;
    const readyChanged = pullReadyRef.current !== ready;
    pullDistanceRef.current = capped;
    pullReadyRef.current = ready;
    if (!distanceChanged && !readyChanged) return;
    if (pullRef.current) {
      pullRef.current.style.height = `${capped}px`;
      pullRef.current.classList.toggle('ready', ready);
    }
    if (pullLabelRef.current) {
      pullLabelRef.current.textContent = ready ? 'Release to load new posts' : 'Pull to refresh';
    }
  }, []);

  const renderEmptyPlaceholder = useCallback(() => {
    const authed = Boolean(keys?.npub);
    if (!authed) {
      return (
        <EmptyState
          title="Welcome to Honeytrap"
          message="Open Menu, sign in with NIP-07/NIP-46, then load your feed."
          icon={Search}
          actionLabel="Open search"
          onAction={() => navigate('/search')}
        />
      );
    }
    return (
      <EmptyState
        title="Your feed is empty"
        message={following.length > 0 ? 'No posts found yet from your selected mode.' : 'Follow people or switch to Global mode to discover posts.'}
        icon={Search}
        actionLabel="Open search"
        onAction={() => navigate('/search')}
      />
    );
  }, [keys?.npub, following.length, navigate]);

  const scrollerRefHandler = useCallback((node: Element | Window | null) => {
    scrollerRef.current = node instanceof HTMLElement ? node : null;
  }, []);

  const handleOpenThread = useCallback((event: NostrEvent) => {
    openThread(navigate, event);
  }, [navigate]);

  const handleReply = useCallback((event: NostrEvent) => {
    setReplyTarget(event);
    setComposerOpen(true);
  }, []);

  const itemContentRenderer = useCallback((_: number, event: NostrEvent) => (
    <FeedGridItem
      event={event}
      onSelect={selectEvent}
      onOpenThread={handleOpenThread}
      onReply={handleReply}
    />
  ), [handleOpenThread, handleReply, selectEvent]);

  const virtualizationTuning = useMemo(() => {
    if (gridColumns >= 3) {
      return {
        prefetchRemainingItems: 72,
        overscanPx: 2600,
        viewportBy: { top: 1400, bottom: 4200 } as const
      };
    }
    if (gridColumns === 2) {
      return {
        prefetchRemainingItems: 40,
        overscanPx: 2200,
        viewportBy: { top: 1200, bottom: 3200 } as const
      };
    }
    return {
      prefetchRemainingItems: 18,
      overscanPx: 1800,
      viewportBy: { top: 1000, bottom: 2400 } as const
    };
  }, [gridColumns]);

  const handleRangeChanged = useCallback((range: { startIndex: number; endIndex: number }) => {
    const remaining = events.length - range.endIndex - 1;
    if (remaining <= virtualizationTuning.prefetchRemainingItems) loadOlderSafe();
  }, [events.length, virtualizationTuning.prefetchRemainingItems]);

  const gridComponents = useMemo(() => ({
    ScrollSeekPlaceholder: () => <div className="post-card post-card--placeholder" aria-hidden="true" />
  }), []);

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
        setPullVisual(capped);
        if (capped > 0) event.preventDefault();
      }}
      onTouchEnd={() => {
        if (pullReadyRef.current) flushPendingSafe();
        pullStartRef.current = null;
        setPullVisual(0);
      }}
      onWheel={(event) => {
        if (isInteractiveTarget(event.target)) return;
        const scroller = scrollerRef.current;
        if (!scroller || scroller.scrollTop > 0) return;
        if (event.deltaY >= 0) return;
        const next = Math.min(120, wheelPullRef.current + Math.abs(event.deltaY));
        wheelPullRef.current = next;
        setPullVisual(next);
        if (wheelTimerRef.current) window.clearTimeout(wheelTimerRef.current);
        wheelTimerRef.current = window.setTimeout(() => {
          if (wheelPullRef.current > 70) flushPendingSafe();
          wheelPullRef.current = 0;
          setPullVisual(0);
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
      <div className="feed-pull" ref={pullRef} style={{ height: 0 }}>
        <span ref={pullLabelRef}>Pull to refresh</span>
      </div>
      
      {events.length === 0 && !feedLoading && (
        <div className="feed-virtuoso flex-auto">
          {renderEmptyPlaceholder()}
        </div>
      )}

      {(events.length > 0 || feedLoading) && (
        <VirtuosoGrid
          ref={virtuosoRef}
          scrollerRef={scrollerRefHandler}
          className="feed-virtuoso"
          listClassName="feed-grid"
          itemClassName="feed-grid-item"
          components={gridComponents}
          data={events}
          computeItemKey={(_, event) => event.id}
          overscan={virtualizationTuning.overscanPx}
          increaseViewportBy={virtualizationTuning.viewportBy}
          rangeChanged={handleRangeChanged}
          endReached={() => loadOlderSafe()}
          scrollSeekConfiguration={{
            enter: (velocity) => Math.abs(velocity) > 200,
            exit: (velocity) => Math.abs(velocity) < 30,
          }}
          itemContent={itemContentRenderer}
        />
      )}
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

const FeedGridItem = React.memo(function FeedGridItem({
  event,
  onSelect,
  onOpenThread,
  onReply
}: {
  event: NostrEvent;
  onSelect: (event?: NostrEvent) => void;
  onOpenThread: (event: NostrEvent) => void;
  onReply: (event: NostrEvent) => void;
}) {
  // Stable callbacks so PostCard's React.memo bailout is not defeated.
  // These are defined inside FeedGridItem which is already memoized per event.
  const handleOpenThread = useCallback(() => onOpenThread(event), [onOpenThread, event]);
  const handleReply = useCallback(() => onReply(event), [onReply, event]);
  return (
    <PostCard
      event={event}
      onSelect={onSelect}
      onOpenThread={handleOpenThread}
      showActions
      onReply={handleReply}
    />
  );
});

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

function getFeedGridColumns(width: number): number {
  if (width >= 1200) return 3;
  if (width >= 768) return 2;
  return 1;
}
