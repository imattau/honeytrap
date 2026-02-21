import React, { useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { Virtuoso } from 'react-virtuoso';
import { X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { openThread } from './threadNavigation';
import type { ThreadNode } from '../nostr/thread';
import type { NostrEvent, ProfileMetadata } from '../nostr/types';
import { useAppState } from './AppState';
import { PostCard } from './PostCard';
import { Composer } from './Composer';
import { ZapComposer } from './ZapComposer';
import { getThreadPreview } from './threadPreviewCache';

export function ThreadStack() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    profiles,
    selectEvent,
    loadThread,
    publishReply,
    sendZap,
    settings,
    findEventById,
    mediaRelayList,
    attachMedia
  } = useAppState();
  const initialFallback = id ? (getThreadPreview(id) ?? findEventById(id)) : undefined;
  const [nodes, setNodes] = useState<ThreadNode[]>(
    () => (initialFallback ? [{ event: initialFallback, depth: 0, role: 'target' }] : [])
  );
  const [loading, setLoading] = useState(() => !initialFallback);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<NostrEvent | undefined>(undefined);
  const [zapOpen, setZapOpen] = useState(false);
  const [zapTarget, setZapTarget] = useState<NostrEvent | undefined>(undefined);
  const [zapProfile, setZapProfile] = useState<ProfileMetadata | undefined>(undefined);

  useEffect(() => {
    let active = true;
    if (!id) {
      setNodes([]);
      setLoading(false);
      return;
    }
    const fallback = getThreadPreview(id) ?? findEventById(id);
    if (fallback) {
      setNodes([{ event: fallback, depth: 0, role: 'target' }]);
      setLoading(false);
    } else {
      setNodes([]);
      setLoading(true);
    }
    loadThread(id)
      .then((loaded) => {
        if (!active) return;
        if (loaded.length > 0) {
          setNodes(loaded);
          setLoading(false);
          return;
        }
        setNodes(fallback ? [{ event: fallback, depth: 0, role: 'target' }] : []);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, loadThread, findEventById]);

  const isTouch = useMemo(() => window.matchMedia('(pointer: coarse)').matches, []);

  const handleTouchStart: React.TouchEventHandler = (event) => {
    setTouchStart(event.touches[0]?.clientY ?? null);
  };

  const handleTouchEnd: React.TouchEventHandler = (event) => {
    if (touchStart === null) return;
    const endY = event.changedTouches[0]?.clientY ?? touchStart;
    if (endY - touchStart > 80) closeThread();
    setTouchStart(null);
  };

  const closeThread = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) {
      flushSync(() => navigate(-1));
    } else {
      flushSync(() => navigate('/', { replace: true }));
    }
  };

  const handleReply = (event: NostrEvent) => {
    setReplyTarget(event);
    setComposerOpen(true);
  };

  const handleZap = (event: NostrEvent) => {
    setZapTarget(event);
    setZapProfile(profiles[event.pubkey]);
    setZapOpen(true);
  };

  return (
    <div className="thread-stack" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <div className={`progress-line ${loading ? 'active' : ''}`} aria-hidden="true" />
      {!isTouch && (
        <button
          type="button"
          className="thread-close"
          onClick={(event) => {
            event.stopPropagation();
            closeThread();
          }}
          aria-label="Close thread">
          <X size={18} />
        </button>
      )}
      <Virtuoso
        className="thread-virtuoso"
        data={nodes}
        computeItemKey={(_, node) => node.event.id}
        overscan={600}
        components={{
          EmptyPlaceholder: () => (
            <div className="thread-empty">{loading ? 'Loading thread…' : 'Thread unavailable.'}</div>
          )
        }}
        itemContent={(_, node) => (
          <div className="thread-item" data-depth={node.depth}>
            <PostCard
              event={node.event}
              profile={profiles[node.event.pubkey]}
              onOpenThread={() => openThread(navigate, node.event)}
              depth={node.depth}
              variant={node.role}
              showActions
              showMoreButton={false}
              forceExpanded
              onReply={() => handleReply(node.event)}
              onZap={() => handleZap(node.event)}
            />
          </div>
        )}
      />
      <Composer
        open={composerOpen}
        replyTo={replyTarget}
        onClose={() => setComposerOpen(false)}
        onSubmit={(input) => replyTarget ? publishReply(input, replyTarget) : Promise.resolve()}
        mediaRelays={mediaRelayList.length > 0 ? mediaRelayList : settings.mediaRelays}
        onAttachMedia={attachMedia}
      />
      <ZapComposer
        open={zapOpen}
        presets={settings.wallet?.presets ?? []}
        onClose={() => setZapOpen(false)}
        onSend={(amountSats, comment) => zapTarget ? sendZap({
          event: zapTarget,
          profile: zapProfile,
          amountSats,
          comment
        }) : Promise.resolve()}
      />
    </div>
  );
}
