import React, { useEffect, useMemo, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { X } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { ThreadNode } from '../nostr/thread';
import type { NostrEvent, ProfileMetadata } from '../nostr/types';
import { useAppState } from './AppState';
import { PostCard } from './PostCard';
import { Composer } from './Composer';
import { ZapComposer } from './ZapComposer';

export function ThreadStack() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
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
  const [nodes, setNodes] = useState<ThreadNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<NostrEvent | undefined>(undefined);
  const [zapOpen, setZapOpen] = useState(false);
  const [zapTarget, setZapTarget] = useState<NostrEvent | undefined>(undefined);
  const [zapProfile, setZapProfile] = useState<ProfileMetadata | undefined>(undefined);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    const stateEvent = (location.state as { event?: NostrEvent } | undefined)?.event;
    const cached = findEventById(id);
    const fallback = stateEvent ?? cached;
    if (fallback) {
      setNodes([{ event: fallback, depth: 0, role: 'target' }]);
      setLoading(false);
    }
    loadThread(id)
      .then((loaded) => {
        if (loaded.length > 0) {
          setNodes(loaded);
          return;
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [id, loadThread, location.state, findEventById]);

  const isTouch = useMemo(() => window.matchMedia('(pointer: coarse)').matches, []);

  const handleTouchStart: React.TouchEventHandler = (event) => {
    setTouchStart(event.touches[0]?.clientY ?? null);
  };

  const handleTouchEnd: React.TouchEventHandler = (event) => {
    if (touchStart === null) return;
    const endY = event.changedTouches[0]?.clientY ?? touchStart;
    if (endY - touchStart > 80) navigate('/');
    setTouchStart(null);
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
        <button className="thread-close" onClick={() => navigate('/')}
          aria-label="Close thread">
          <X size={18} />
        </button>
      )}
      <Virtuoso
        className="thread-virtuoso"
        data={nodes}
        overscan={600}
        components={{
          EmptyPlaceholder: () => (
            <div className="thread-empty">Loading thread…</div>
          )
        }}
        itemContent={(_, node) => (
          <div className="thread-item" data-depth={node.depth}>
            <PostCard
              event={node.event}
              profile={profiles[node.event.pubkey]}
              onSelect={(event) => selectEvent(event)}
              depth={node.depth}
              variant={node.role}
              showActions
              showMoreButton={false}
              forceExpanded
              actionsPosition="top"
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
