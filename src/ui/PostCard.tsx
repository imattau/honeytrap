import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, UserCircle } from 'lucide-react';
import type { NostrEvent, ProfileMetadata } from '../nostr/types';
import { extractMedia } from '../nostr/media';
import { extractLinks } from '../nostr/links';
import { extractEmojiMap, parseLongFormTags, stripInvisibleSeparators, tokenizeLineWithEmojiAndHashtags } from '../nostr/utils';
import { useNavigate } from 'react-router-dom';
import { flushSync } from 'react-dom';
import { decodeNostrUri, encodeNpubUri, splitNostrContent } from '../nostr/uri';
import { openThread } from './threadNavigation';
import { PostActions } from './PostActions';
import { isSensitiveEvent } from '../nostr/contentFlags';
import { useTransportStatus } from './state/useTransportStatus';
import { copyToClipboard, shortenId } from './utils';

// Sub-components
import { PostHeader } from './PostHeader';
import { PostMediaItem } from './PostMediaItem';
import { MediaLightbox } from './MediaLightbox';
import { LinkPreviewCard } from './LinkPreviewCard';
import { PostContextMenu } from './PostContextMenu';
import { Card } from './Card';

import { useSocial } from './state/contexts/SocialContext';
import { useFeedActions, useProfile, useProfiles, useProfilesRef } from './state/contexts/FeedContext';
import { useP2P } from './state/contexts/P2PContext';
import { useTransport } from './state/contexts/TransportContext';

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
  profile: profileProp,
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
    selectEvent,
    selectAuthor,
    publishRepost,
    publishReaction,
    shareEvent,
    hydrateProfiles
  } = useFeedActions();

  // Subscribe only to this author's profile to avoid re-rendering on every
  // unrelated profile load. useProfile subscribes to the full profiles context.
  const profileFromContext = useProfile(event.pubkey);
  const authorProfile = profileProp ?? profileFromContext;

  const { transportStore } = useTransport();
  const { loadMedia } = useP2P();
  const { isFollowed, isBlocked, isNsfwAuthor, toggleFollow, toggleBlock, toggleNsfwAuthor } = useSocial();

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
  // Track the last pubkey we requested hydration for so we only fire once per
  // card mount (not on every re-render). Calling hydrateProfiles during render
  // (instead of in useEffect) starts the fetch before the first paint.
  const hydratedPubkeyRef = useRef<string | null>(null);
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

  // Fire profile hydration during render (before paint) rather than in a
  // useEffect (after paint). The ref guards against re-firing on every render.
  if (!authorProfile && hydratedPubkeyRef.current !== event.pubkey) {
    hydratedPubkeyRef.current = event.pubkey;
    hydrateProfiles([event.pubkey]).catch(() => null);
  }

  const transportStatus = useTransportStatus(transportStore, event.id);
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
      setToast(`Copied ${shortenId(uri, 26)}`);
    } catch {
      setToast('Unable to share event');
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <>
      <Card
        depth={depth}
        variant={variant}
        onClick={() => openPrimary()}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMenuPos({ x: e.clientX, y: e.clientY });
        }}
        onTouchStart={(e) => {
          const touch = e.touches[0];
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
        <PostHeader
          event={event}
          authorProfile={authorProfile}
          followed={followed}
          blocked={blocked}
          nsfwAuthor={nsfwAuthor}
          status={transportStatus}
          onAuthorClick={(e) => {
            e.stopPropagation();
            flushSync(() => navigate(`/author/${event.pubkey}`));
          }}
          onFollowToggle={(e) => {
            e.stopPropagation();
            toggleFollow(event.pubkey);
          }}
          onBlockToggle={(e) => {
            e.stopPropagation();
            toggleBlock(event.pubkey);
          }}
          onNsfwToggle={(e) => {
            e.stopPropagation();
            toggleNsfwAuthor(event.pubkey);
          }}
        />

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
            type="button"
            className="nsfw-reveal"
            onClick={(e) => {
              e.stopPropagation();
              setRevealed(true);
            }}
          >
            NSFW - tap to reveal
          </button>
        )}

        <div
          className={`post-content ${isExpanded ? 'expanded' : 'collapsed'} ${isSensitive && !revealed ? 'nsfw-blur' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            openPrimary();
          }}
        >
          {isLongForm ? (
            <div className="space-y-2">
              <div className="post-title">{longForm?.title ?? 'Untitled long-form'}</div>
              <p className="post-text">{longForm?.summary ?? event.content}</p>
            </div>
          ) : (
            <div className="post-text">
              <PostContent
                content={event.content}
                mediaUrls={media.map((m) => m.url)}
                emojiMap={emojiMap}
                onTagClick={(tag) => flushSync(() => navigate(`/tag/${encodeURIComponent(tag)}`))}
                onAuthorClick={(pubkey) => {
                  selectAuthor(pubkey);
                  flushSync(() => navigate(`/author/${pubkey}`));
                }}
                onEventClick={(ev) => openThread(navigate, ev)}
              />
            </div>
          )}
        </div>

        {visibleMedia.length > 0 && (
          <div className={`post-media ${isSensitive && !revealed ? 'nsfw-blur' : ''}`}>
            {visibleMedia.map((item, idx) => (
              <PostMediaItem
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
          <button
            type="button"
            className="post-more"
            onClick={(e) => {
              e.stopPropagation();
              openPrimary();
            }}
          >
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
      </Card>

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

/**
 * Internal component to handle content rendering with parsing.
 */
function PostContent({
  content,
  mediaUrls,
  emojiMap,
  onTagClick,
  onAuthorClick,
  onEventClick
}: {
  content: string;
  mediaUrls: string[];
  emojiMap: Record<string, string>;
  onTagClick: (tag: string) => void;
  onAuthorClick: (pubkey: string) => void;
  onEventClick: (event: NostrEvent) => void;
}) {
  const profiles = useProfiles();
  const { findEventById } = useFeedActions();
  const cleaned = stripInvisibleSeparators(stripMediaUrls(content, mediaUrls));
  const parts = splitNostrContent(cleaned);

  return (
    <>
      {parts.map((part, index) => {
        if (part.type === 'text') {
          return (
            <React.Fragment key={`t-${index}`}>
              {renderTextWithBreaks(part.value, onTagClick, emojiMap)}
            </React.Fragment>
          );
        }

        const decoded = decodeNostrUri(part.value);
        if (!decoded) return <span key={`u-${index}`}>{part.value}</span>;

        if (decoded.type === 'npub' || decoded.type === 'nprofile') {
          const pubkey = decoded.pubkey;
          const profileInfo = resolveProfile(profiles, pubkey);
          return (
            <button
              key={`p-${index}`}
              className="nostr-chip"
              onClick={(e) => {
                e.stopPropagation();
                onAuthorClick(pubkey);
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
                  onEventClick(ev);
                }}
              >
                <div className="nested-title">Referenced event</div>
                <p className="post-text">{ev.content.slice(0, 140)}{ev.content.length > 140 ? '…' : ''}</p>
              </div>
            );
          }
          return (
            <button key={`e-${index}`} className="nostr-chip" onClick={(e) => e.stopPropagation()}>
              {decoded.id.slice(0, 10)}…
            </button>
          );
        }

        return <span key={`u-${index}`}>{part.value}</span>;
      })}
    </>
  );
}

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

function resolveProfile(profiles: Record<string, ProfileMetadata>, pubkey: string): ProfileMetadata | undefined {
  return profiles[pubkey] ?? profiles[pubkey.toLowerCase()] ?? profiles[pubkey.toUpperCase()];
}

function stripMediaUrls(content: string, mediaUrls: string[]) {
  let cleaned = content;
  mediaUrls.forEach((url) => {
    const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleaned = cleaned.replace(new RegExp(`\\s*${escaped}\\s*`, 'g'), ' ');
  });
  return cleaned.trim();
}
