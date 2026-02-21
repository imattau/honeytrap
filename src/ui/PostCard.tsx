import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Radio, Bolt, Link2, ShieldCheck, Sparkles, UserCircle, UserPlus, UserCheck, Ban, AlertTriangle, ChevronLeft, ChevronRight, Copy, Minus, Plus, X } from 'lucide-react';
import type { NostrEvent, ProfileMetadata } from '../nostr/types';
import { extractMedia, type MediaSource } from '../nostr/media';
import { extractLinks, type LinkPreviewSource } from '../nostr/links';
import { extractEmojiMap, parseLongFormTags, stripInvisibleSeparators, tokenizeLineWithEmojiAndHashtags } from '../nostr/utils';
import { useAppState } from './AppState';
import { useNavigate } from 'react-router-dom';
import { flushSync } from 'react-dom';
import { decodeNostrUri, encodeNpubUri, splitNostrContent } from '../nostr/uri';
import { openThread } from './threadNavigation';
import { PostActions } from './PostActions';
import { IconButton } from './IconButton';
import { isSensitiveEvent } from '../nostr/contentFlags';
import { useTransportStatus } from './state/useTransportStatus';

interface PostCardProps {
  event: NostrEvent;
  profile?: ProfileMetadata;
  onSelect?: (event: NostrEvent) => void;
  onOpenThread?: () => void;
  onReply?: () => void;
  onZap?: () => void;
  depth?: number;
  variant?: 'root' | 'ancestor' | 'target' | 'reply';
  showActions?: boolean;
  showMoreButton?: boolean;
  forceExpanded?: boolean;
  actionsPosition?: 'top' | 'bottom';
}

export const PostCard = React.memo(function PostCard({
  event,
  profile,
  onSelect,
  onOpenThread,
  onReply,
  onZap,
  depth = 0,
  variant,
  showActions = false,
  showMoreButton = true,
  forceExpanded = false,
  actionsPosition = 'bottom'
}: PostCardProps) {
  const {
    profiles,
    findEventById,
    selectEvent,
    selectAuthor,
    transportStore,
    loadMedia,
    isFollowed,
    isBlocked,
    isNsfwAuthor,
    toggleFollow,
    toggleBlock,
    toggleNsfwAuthor,
    publishRepost,
    publishReaction,
    shareEvent
  } = useAppState();
  const [expanded] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [liked, setLiked] = useState(false);
  const [reposted, setReposted] = useState(false);
  const [shared, setShared] = useState(false);
  const [busyAction, setBusyAction] = useState<'like' | 'repost' | 'share' | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const touchPressTimerRef = useRef<number | null>(null);
  const fallbackAvatar = '/assets/honeytrap_logo_256.png';
  const navigate = useNavigate();
  const media = useMemo(() => extractMedia(event), [event]);
  const links = useMemo(() => extractLinks(event), [event]);
  const emojiMap = useMemo(() => extractEmojiMap(event.tags), [event.tags]);
  const isLongForm = event.kind === 30023;
  const longForm = useMemo(() => (isLongForm ? parseLongFormTags(event.tags) : undefined), [event.tags, isLongForm]);
  const nsfwAuthor = isNsfwAuthor(event.pubkey);
  const isSensitive = useMemo(() => isSensitiveEvent(event) || nsfwAuthor, [event, nsfwAuthor]);
  const isExpanded = forceExpanded || expanded;
  const hasMore = showMoreButton && !forceExpanded && (event.content.length > 320 || media.length > 1 || links.length > 1);
  const visibleMedia = isExpanded || !showMoreButton ? media : media.slice(0, 1);
  const visibleLinks = isExpanded || !showMoreButton ? links : links.slice(0, 1);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 1800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    return () => {
      if (touchPressTimerRef.current) {
        window.clearTimeout(touchPressTimerRef.current);
      }
    };
  }, []);

  const renderContent = () => {
    const cleaned = stripInvisibleSeparators(stripMediaUrls(event.content, media.map((item) => item.url)));
    const parts = splitNostrContent(cleaned);
    return parts.map((part, index) => {
      if (part.type === 'text') {
        return (
          <React.Fragment key={`t-${index}`}>
            {renderTextWithBreaks(part.value, (tag) => {
              flushSync(() => navigate(`/tag/${encodeURIComponent(tag)}`));
            }, emojiMap)}
          </React.Fragment>
        );
      }
      const decoded = decodeNostrUri(part.value);
      if (!decoded) return <span key={`u-${index}`}>{part.value}</span>;
      if (decoded.type === 'npub' || decoded.type === 'nprofile') {
        const pubkey = decoded.pubkey;
        const profileInfo = profiles[pubkey];
        return (
          <button
            key={`p-${index}`}
            className="nostr-chip"
            onClick={(e) => {
              e.stopPropagation();
              selectAuthor(pubkey);
              flushSync(() => navigate(`/author/${pubkey}`));
            }}
          >
            <UserCircle size={14} />
            {profileInfo?.display_name ?? profileInfo?.name ?? pubkey.slice(0, 10)}
          </button>
        );
      }
      if (decoded.type === 'nevent' || decoded.type === 'note') {
        const ev = findEventById(decoded.id);
        if (ev) {
          return (
            <div
              key={`e-${index}`}
              className="nested-card"
              onClick={(e) => {
                e.stopPropagation();
                openThread(navigate, ev);
              }}
            >
              <div className="nested-title">Referenced event</div>
              <p className="post-text">{ev.content.slice(0, 140)}{ev.content.length > 140 ? '…' : ''}</p>
            </div>
          );
        }
        return (
          <button key={`e-${index}`}
            className="nostr-chip"
            onClick={(e) => e.stopPropagation()}>
            {decoded.id.slice(0, 10)}…
          </button>
        );
      }
      return <span key={`u-${index}`}>{part.value}</span>;
    });
  };

  const status = useTransportStatus(transportStore, event.id);

  const followed = isFollowed(event.pubkey);
  const blocked = isBlocked(event.pubkey);

  const openPrimary = () => {
    onSelect?.(event);
    selectEvent(event);
    if (isLongForm) {
      flushSync(() => navigate(`/article/${event.id}`));
      return;
    }
    onOpenThread?.();
  };

  const handleRepost = async () => {
    if (busyAction) return;
    setBusyAction('repost');
    try {
      await publishRepost(event);
      setReposted((prev) => !prev);
      setToast('Repost published');
    } catch {
      setToast('Unable to repost');
    } finally {
      setBusyAction(null);
    }
  };

  const handleLike = async () => {
    if (busyAction) return;
    setBusyAction('like');
    try {
      await publishReaction(event);
      setLiked((prev) => !prev);
      setToast('Reaction published');
    } catch {
      setToast('Unable to publish reaction');
    } finally {
      setBusyAction(null);
    }
  };

  const handleShare = async () => {
    if (busyAction) return;
    setBusyAction('share');
    try {
      const uri = await shareEvent(event);
      setShared(true);
      setToast(`Copied ${uri.slice(0, 26)}…`);
    } catch {
      setToast('Unable to share event');
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <>
      <article
        className={`post-card depth-${Math.min(depth, 6)} variant-${variant ?? 'normal'}`}
        onClick={() => openPrimary()}
        onContextMenu={(eventArg) => {
          eventArg.preventDefault();
          eventArg.stopPropagation();
          setMenuPos({ x: eventArg.clientX, y: eventArg.clientY });
        }}
        onTouchStart={(touchEvent) => {
          const touch = touchEvent.touches[0];
          if (!touch) return;
          if (touchPressTimerRef.current) window.clearTimeout(touchPressTimerRef.current);
          touchPressTimerRef.current = window.setTimeout(() => {
            setMenuPos({ x: touch.clientX, y: touch.clientY });
          }, 450);
        }}
        onTouchMove={() => {
          if (touchPressTimerRef.current) {
            window.clearTimeout(touchPressTimerRef.current);
            touchPressTimerRef.current = null;
          }
        }}
        onTouchEnd={() => {
          if (touchPressTimerRef.current) {
            window.clearTimeout(touchPressTimerRef.current);
            touchPressTimerRef.current = null;
          }
        }}
      >
        <header className="post-header">
          <div className="post-author">
            {profile?.picture ? (
              <img src={profile.picture} alt="avatar" className="post-avatar" onClick={(e) => { e.stopPropagation(); flushSync(() => navigate(`/author/${event.pubkey}`)); }} />
            ) : (
              <img src={fallbackAvatar} alt="avatar" className="post-avatar fallback" onClick={(e) => { e.stopPropagation(); flushSync(() => navigate(`/author/${event.pubkey}`)); }} />
            )}
            <div>
              <div
                className="post-name"
                role="button"
                onClick={(e) => {
                  e.stopPropagation();
                  flushSync(() => navigate(`/author/${event.pubkey}`));
                }}
              >
                {profile?.display_name ?? profile?.name ?? event.pubkey.slice(0, 12)}
              </div>
              <div className="post-time">{new Date(event.created_at * 1000).toLocaleString()}</div>
            </div>
            <div className="author-actions">
              <IconButton
                title={followed ? 'Unfollow' : 'Follow'}
                ariaLabel={followed ? 'Unfollow' : 'Follow'}
                active={followed}
                tone="follow"
                variant="author"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFollow(event.pubkey);
                }}
              >
                {followed ? <UserCheck size={14} /> : <UserPlus size={14} />}
              </IconButton>
              <IconButton
                title={blocked ? 'Unblock' : 'Block'}
                ariaLabel={blocked ? 'Unblock' : 'Block'}
                active={blocked}
                tone="block"
                variant="author"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleBlock(event.pubkey);
                }}
              >
                <Ban size={14} />
              </IconButton>
              <IconButton
                title={nsfwAuthor ? 'Unmark NSFW author' : 'Mark NSFW author'}
                ariaLabel={nsfwAuthor ? 'Unmark NSFW author' : 'Mark NSFW author'}
                active={nsfwAuthor}
                tone="nsfw"
                variant="author"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleNsfwAuthor(event.pubkey);
                }}
              >
                <AlertTriangle size={14} />
              </IconButton>
            </div>
          </div>
          <div className="post-icons">
            <IconButton title="Relay" ariaLabel="Relay" active={status.relay} tone="relay">
              <Radio size={16} />
            </IconButton>
            <IconButton title="P2P assist" ariaLabel="P2P assist" active={status.p2p} tone="p2p" className={status.p2p ? 'icon-btn--p2p-live' : undefined}>
              <Bolt size={16} />
            </IconButton>
            <IconButton title="HTTP fallback" ariaLabel="HTTP fallback" active={status.http} tone="http">
              <Link2 size={16} />
            </IconButton>
            <IconButton title="Verified" ariaLabel="Verified" active={status.verified} tone="verified">
              <ShieldCheck size={16} />
            </IconButton>
          </div>
        </header>

        {showActions && actionsPosition === 'top' && (
          <PostActions
            onReply={onReply}
            onRepost={handleRepost}
            onLike={handleLike}
            onZap={onZap}
            onShare={handleShare}
            reposted={reposted}
            liked={liked}
            shared={shared}
            disabled={busyAction !== null}
          />
        )}

        {isSensitive && !revealed && (
          <button
            className="nsfw-reveal"
            onClick={(e) => {
              e.stopPropagation();
              setRevealed(true);
            }}
          >
            NSFW - tap to reveal
          </button>
        )}

        <div className={`post-content ${isExpanded ? 'expanded' : 'collapsed'} ${isSensitive && !revealed ? 'nsfw-blur' : ''}`} onClick={(e) => { e.stopPropagation(); openPrimary(); }}>
          {isLongForm ? (
            <div className="space-y-2">
              <div className="post-title">{longForm?.title ?? 'Untitled long-form'}</div>
              <p className="post-text">{longForm?.summary ?? event.content}</p>
            </div>
          ) : (
            <p className="post-text">{renderContent()}</p>
          )}
        </div>

        {visibleMedia.length > 0 && (
          <div className={`post-media ${isSensitive && !revealed ? 'nsfw-blur' : ''}`}>
            {visibleMedia.map((item, idx) => (
              <MediaItem
                key={item.url}
                item={item}
                eventId={event.id}
                authorPubkey={event.pubkey}
                loadMedia={loadMedia}
                onActivate={() => {
                  const sourceIndex = media.findIndex((candidate) => candidate.url === item.url && candidate.magnet === item.magnet);
                  setLightboxIndex(sourceIndex >= 0 ? sourceIndex : idx);
                }}
              />
            ))}
          </div>
        )}

        {visibleLinks.length > 0 && (
          <div className={`post-links ${isSensitive && !revealed ? 'nsfw-blur' : ''}`}>
            {visibleLinks.map((item) => (
              <LinkPreviewCard key={item.url} item={item} />
            ))}
          </div>
        )}

        {hasMore && (
          <button className="post-more" onClick={(e) => { e.stopPropagation(); openPrimary(); }}>
            <Sparkles size={14} /> More
          </button>
        )}

        {showActions && actionsPosition === 'bottom' && (
          <PostActions
            onReply={onReply}
            onRepost={handleRepost}
            onLike={handleLike}
            onZap={onZap}
            onShare={handleShare}
            reposted={reposted}
            liked={liked}
            shared={shared}
            disabled={busyAction !== null}
          />
        )}
      </article>

      {lightboxIndex !== null && (
        <MediaLightbox
          items={media}
          startIndex={lightboxIndex}
          eventId={event.id}
          authorPubkey={event.pubkey}
          loadMedia={loadMedia}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {menuPos && (
        <PostContextMenu
          position={menuPos}
          onClose={() => setMenuPos(null)}
          onCopyEventId={async () => {
            await copyToClipboard(event.id);
            setToast('Event id copied');
          }}
          onCopyAuthor={async () => {
            await copyToClipboard(encodeNpubUri(event.pubkey).replace(/^nostr:/, ''));
            setToast('Author npub copied');
          }}
          onCopyRaw={async () => {
            await copyToClipboard(JSON.stringify(event, null, 2));
            setToast('Event JSON copied');
          }}
        />
      )}

      {toast && <div className="post-toast">{toast}</div>}
    </>
  );
});

function renderTextWithBreaks(text: string, onTagClick: (tag: string) => void, emojiMap: Record<string, string>) {
  return text.split('\n').map((line, idx, arr) => (
    <React.Fragment key={`l-${idx}`}>
      {renderLineWithHashtags(line, onTagClick, emojiMap)}
      {idx < arr.length - 1 && <br />}
    </React.Fragment>
  ));
}

function renderLineWithHashtags(line: string, onTagClick: (tag: string) => void, emojiMap: Record<string, string>) {
  const tokens = tokenizeLineWithEmojiAndHashtags(line, emojiMap);
  const parts: React.ReactNode[] = [];
  tokens.forEach((token, index) => {
    if (token.type === 'text') {
      parts.push(token.value);
      return;
    }
    if (token.type === 'emoji') {
      parts.push(
        <img
          key={`emoji-${index}`}
          className="post-custom-emoji"
          src={token.url}
          alt={`:${token.value}:`}
          loading="lazy"
          decoding="async"
        />
      );
      return;
    }
    const tag = token.value;
    parts.push(
      <button
        key={`tag-${index}`}
        className="hashtag-link"
        onClick={(event) => {
          event.stopPropagation();
          onTagClick(tag.toLowerCase());
        }}
      >
        #{tag}
      </button>
    );
  });
  return parts;
}

function stripMediaUrls(content: string, mediaUrls: string[]) {
  let cleaned = content;
  mediaUrls.forEach((url) => {
    const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleaned = cleaned.replace(new RegExp(`\\s*${escaped}\\s*`, 'g'), ' ');
  });
  return cleaned.trim();
}

function MediaItem({
  item,
  eventId,
  authorPubkey,
  loadMedia,
  onActivate
}: {
  item: MediaSource;
  eventId: string;
  authorPubkey: string;
  loadMedia: (input: {
    eventId: string;
    source: { url: string; magnet?: string; sha256?: string; type: 'media' };
    authorPubkey: string;
    timeoutMs?: number;
  }) => Promise<{ url: string; source: 'p2p' | 'http' }>;
  onActivate?: () => void;
}) {
  const isVideo = isVideoUrl(item.url);
  const [src, setSrc] = useState(item.url);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    loadMedia({
      eventId,
      authorPubkey,
      source: { url: item.url, magnet: item.magnet, sha256: item.sha256, type: 'media' },
      timeoutMs: isVideo ? 4000 : 800
    })
      .then((result) => {
        if (!active) return;
        if (result.url !== item.url) setSrc(result.url);
      })
      .catch(() => null);
    return () => {
      active = false;
    };
  }, [authorPubkey, eventId, isVideo, item.magnet, item.sha256, item.url, loadMedia]);

  return (
    <button
      type="button"
      className={`post-media-shell ${loaded ? 'loaded' : ''} ${isVideo ? 'video' : 'image'}`}
      onClick={(eventArg) => {
        eventArg.stopPropagation();
        onActivate?.();
      }}
    >
      {isVideo ? (
        <video
          src={src}
          controls
          className="post-media-item"
          onLoadedData={() => setLoaded(true)}
        />
      ) : (
        <img
          src={src}
          alt="media"
          className="post-media-item"
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
        />
      )}
    </button>
  );
}

function MediaLightbox({
  items,
  startIndex,
  eventId,
  authorPubkey,
  loadMedia,
  onClose
}: {
  items: MediaSource[];
  startIndex: number;
  eventId: string;
  authorPubkey: string;
  loadMedia: (input: {
    eventId: string;
    source: { url: string; magnet?: string; sha256?: string; type: 'media' };
    authorPubkey: string;
    timeoutMs?: number;
  }) => Promise<{ url: string; source: 'p2p' | 'http' }>;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const [zoom, setZoom] = useState(1);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const current = items[index] ?? items[0];

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') setIndex((prev) => (prev + 1) % items.length);
      if (event.key === 'ArrowLeft') setIndex((prev) => (prev - 1 + items.length) % items.length);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [items.length, onClose]);

  useEffect(() => {
    setZoom(1);
  }, [index]);

  if (!current) return null;

  return (
    <div className="media-lightbox" onClick={onClose}>
      <button className="media-lightbox-close" onClick={(eventArg) => {
        eventArg.stopPropagation();
        onClose();
      }} aria-label="Close media viewer">
        <X size={18} />
      </button>
      {items.length > 1 && (
        <>
          <button
            className="media-lightbox-nav prev"
            onClick={(eventArg) => {
              eventArg.stopPropagation();
              setIndex((prev) => (prev - 1 + items.length) % items.length);
            }}
            aria-label="Previous media"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            className="media-lightbox-nav next"
            onClick={(eventArg) => {
              eventArg.stopPropagation();
              setIndex((prev) => (prev + 1) % items.length);
            }}
            aria-label="Next media"
          >
            <ChevronRight size={20} />
          </button>
        </>
      )}
      <div
        className="media-lightbox-stage"
        onClick={(eventArg) => eventArg.stopPropagation()}
        onTouchStart={(eventArg) => setTouchStartX(eventArg.touches[0]?.clientX ?? null)}
        onTouchEnd={(eventArg) => {
          const endX = eventArg.changedTouches[0]?.clientX;
          if (touchStartX === null || typeof endX !== 'number') return;
          const delta = endX - touchStartX;
          if (Math.abs(delta) < 40 || items.length <= 1) return;
          if (delta > 0) setIndex((prev) => (prev - 1 + items.length) % items.length);
          else setIndex((prev) => (prev + 1) % items.length);
          setTouchStartX(null);
        }}
      >
        <ResolvedLightboxMedia
          item={current}
          eventId={eventId}
          authorPubkey={authorPubkey}
          loadMedia={loadMedia}
          zoom={zoom}
          onZoomToggle={() => setZoom((prev) => (prev >= 2 ? 1 : 2))}
        />
      </div>
      {!isVideoUrl(current.url) && (
        <div className="media-lightbox-zoom" onClick={(eventArg) => eventArg.stopPropagation()}>
          <button
            className="media-lightbox-tool"
            onClick={() => setZoom((prev) => Math.max(1, Number((prev - 0.25).toFixed(2))))}
            aria-label="Zoom out"
          >
            <Minus size={16} />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            className="media-lightbox-tool"
            onClick={() => setZoom((prev) => Math.min(3, Number((prev + 0.25).toFixed(2))))}
            aria-label="Zoom in"
          >
            <Plus size={16} />
          </button>
        </div>
      )}
      <div className="media-lightbox-count">{index + 1} / {items.length}</div>
    </div>
  );
}

function ResolvedLightboxMedia({
  item,
  eventId,
  authorPubkey,
  loadMedia,
  zoom,
  onZoomToggle
}: {
  item: MediaSource;
  eventId: string;
  authorPubkey: string;
  loadMedia: (input: {
    eventId: string;
    source: { url: string; magnet?: string; sha256?: string; type: 'media' };
    authorPubkey: string;
    timeoutMs?: number;
  }) => Promise<{ url: string; source: 'p2p' | 'http' }>;
  zoom: number;
  onZoomToggle: () => void;
}) {
  const isVideo = isVideoUrl(item.url);
  const [src, setSrc] = useState(item.url);

  useEffect(() => {
    let active = true;
    loadMedia({
      eventId,
      authorPubkey,
      source: { url: item.url, magnet: item.magnet, sha256: item.sha256, type: 'media' },
      timeoutMs: isVideo ? 5000 : 1200
    })
      .then((result) => {
        if (!active) return;
        if (result.url !== item.url) setSrc(result.url);
      })
      .catch(() => null);
    return () => {
      active = false;
    };
  }, [authorPubkey, eventId, isVideo, item.magnet, item.sha256, item.url, loadMedia]);

  if (isVideo) {
    return <video className="media-lightbox-item" src={src} controls autoPlay />;
  }

  return (
    <img
      className="media-lightbox-item"
      src={src}
      alt="media"
      style={{ transform: `scale(${zoom})` }}
      onDoubleClick={() => onZoomToggle()}
    />
  );
}

function PostContextMenu({
  position,
  onClose,
  onCopyEventId,
  onCopyAuthor,
  onCopyRaw
}: {
  position: { x: number; y: number };
  onClose: () => void;
  onCopyEventId: () => Promise<void>;
  onCopyAuthor: () => Promise<void>;
  onCopyRaw: () => Promise<void>;
}) {
  return (
    <div className="post-context-layer" onClick={onClose}>
      <div
        className="post-context-menu"
        style={{ left: clamp(position.x, 14, window.innerWidth - 210), top: clamp(position.y, 14, window.innerHeight - 160) }}
        onClick={(eventArg) => eventArg.stopPropagation()}
      >
        <button className="post-context-item" onClick={() => { onCopyEventId().catch(() => null); onClose(); }}>
          <Copy size={14} /> Copy event ID
        </button>
        <button className="post-context-item" onClick={() => { onCopyAuthor().catch(() => null); onClose(); }}>
          <Copy size={14} /> Copy npub
        </button>
        <button className="post-context-item" onClick={() => { onCopyRaw().catch(() => null); onClose(); }}>
          <Copy size={14} /> Copy raw JSON
        </button>
      </div>
    </div>
  );
}

function LinkPreviewCard({ item }: { item: LinkPreviewSource }) {
  let host = item.url;
  let path = '';
  try {
    const parsed = new URL(item.url);
    host = parsed.hostname;
    path = parsed.pathname.length > 1 ? parsed.pathname : '';
  } catch {
    // keep url as-is
  }
  return (
    <a className="link-preview" href={item.url} target="_blank" rel="noreferrer">
      <div className="link-host">{host}</div>
      <div className="link-path">{path || item.url}</div>
    </a>
  );
}

function isVideoUrl(url: string) {
  return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

async function copyToClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const area = document.createElement('textarea');
  area.value = value;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  document.body.removeChild(area);
}
