import React, { useEffect, useMemo, useState } from 'react';
import { Radio, Bolt, Link2, ShieldCheck, Sparkles, UserCircle, UserPlus, UserCheck, Ban, AlertTriangle } from 'lucide-react';
import type { NostrEvent, ProfileMetadata } from '../nostr/types';
import { extractMedia, type MediaSource } from '../nostr/media';
import { extractLinks, type LinkPreviewSource } from '../nostr/links';
import { parseLongFormTags } from '../nostr/utils';
import { useAppState } from './AppState';
import { useNavigate } from 'react-router-dom';
import { decodeNostrUri } from '../nostr/uri';
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

export function PostCard({
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
  const { profiles, findEventById, selectEvent, selectAuthor, transportStore, loadMedia, isFollowed, isBlocked, isNsfwAuthor, toggleFollow, toggleBlock, toggleNsfwAuthor } = useAppState();
  const [expanded, setExpanded] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [liked, setLiked] = useState(false);
  const [reposted, setReposted] = useState(false);
  const [shared, setShared] = useState(false);
  const fallbackAvatar = '/assets/honeytrap_logo_256.png';
  const navigate = useNavigate();
  const media = useMemo(() => extractMedia(event), [event]);
  const links = useMemo(() => extractLinks(event), [event]);
  const isLongForm = event.kind === 30023;
  const longForm = useMemo(() => (isLongForm ? parseLongFormTags(event.tags) : undefined), [event.tags, isLongForm]);
  const nsfwAuthor = isNsfwAuthor(event.pubkey);
  const isSensitive = useMemo(() => isSensitiveEvent(event) || nsfwAuthor, [event, nsfwAuthor]);
  const isExpanded = forceExpanded || expanded;
  const hasMore = showMoreButton && !forceExpanded && (event.content.length > 320 || media.length > 1 || links.length > 1);
  const visibleMedia = isExpanded || !showMoreButton ? media : media.slice(0, 1);
  const visibleLinks = isExpanded || !showMoreButton ? links : links.slice(0, 1);

  const renderContent = () => {
    const cleaned = stripMediaUrls(event.content, media.map((item) => item.url));
    const parts = splitNostrContent(cleaned);
    return parts.map((part, index) => {
      if (part.type === 'text') {
        return <React.Fragment key={`t-${index}`}>{renderTextWithBreaks(part.value, (tag) => {
          navigate(`/tag/${encodeURIComponent(tag)}`);
        })}</React.Fragment>;
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
              navigate(`/author/${pubkey}`);
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
                selectEvent(ev);
                onSelect?.(ev);
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

  return (
    <article className={`post-card depth-${Math.min(depth, 6)} variant-${variant ?? 'normal'}`} onClick={() => onSelect?.(event)}>
      <header className="post-header">
        <div className="post-author">
          {profile?.picture ? (
            <img src={profile.picture} alt="avatar" className="post-avatar" />
          ) : (
            <img src={fallbackAvatar} alt="avatar" className="post-avatar fallback" />
          )}
          <div>
            <div
              className="post-name"
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/author/${event.pubkey}`);
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
          <IconButton title="P2P assist" ariaLabel="P2P assist" active={status.p2p} tone="p2p">
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
          onRepost={() => setReposted((prev) => !prev)}
          onLike={() => setLiked((prev) => !prev)}
          onZap={onZap}
          onShare={() => setShared((prev) => !prev)}
          reposted={reposted}
          liked={liked}
          shared={shared}
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
          NSFW — tap to reveal
        </button>
      )}

      <div className={`post-content ${isExpanded ? 'expanded' : 'collapsed'} ${isSensitive && !revealed ? 'nsfw-blur' : ''}`} onClick={onOpenThread}>
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
          {visibleMedia.map((item) => (
            <MediaItem
              key={item.url}
              item={item}
              eventId={event.id}
              authorPubkey={event.pubkey}
              loadMedia={loadMedia}
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
        <button className="post-more" onClick={(e) => { e.stopPropagation(); onOpenThread?.(); }}>
          <Sparkles size={14} /> More
        </button>
      )}

      {showActions && actionsPosition === 'bottom' && (
        <PostActions
          onReply={onReply}
          onRepost={() => setReposted((prev) => !prev)}
          onLike={() => setLiked((prev) => !prev)}
          onZap={onZap}
          onShare={() => setShared((prev) => !prev)}
          reposted={reposted}
          liked={liked}
          shared={shared}
        />
      )}
    </article>
  );
}

function splitNostrContent(content: string) {
  const regex = /(nostr:[a-z0-9]+)/g;
  const parts: { type: 'text' | 'nostr'; value: string }[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: content.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'nostr', value: match[1] });
    lastIndex = match.index + match[1].length;
  }
  if (lastIndex < content.length) {
    parts.push({ type: 'text', value: content.slice(lastIndex) });
  }
  return parts;
}

function renderTextWithBreaks(text: string, onTagClick: (tag: string) => void) {
  return text.split('\n').map((line, idx, arr) => (
    <React.Fragment key={`l-${idx}`}>
      {renderLineWithHashtags(line, onTagClick)}
      {idx < arr.length - 1 && <br />}
    </React.Fragment>
  ));
}

function renderLineWithHashtags(line: string, onTagClick: (tag: string) => void) {
  const regex = /(^|\s)#([a-zA-Z0-9_]+)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(line)) !== null) {
    const prefix = match[1] ?? '';
    const start = match.index;
    const textEnd = start + prefix.length;
    if (textEnd > lastIndex) {
      parts.push(line.slice(lastIndex, textEnd));
    }
    const tag = match[2];
    parts.push(
      <button
        key={`tag-${start}`}
        className="hashtag-link"
        onClick={(event) => {
          event.stopPropagation();
          onTagClick(tag.toLowerCase());
        }}
      >
        #{tag}
      </button>
    );
    lastIndex = start + prefix.length + 1 + tag.length;
  }
  if (lastIndex < line.length) {
    parts.push(line.slice(lastIndex));
  }
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
  loadMedia
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
}) {
  const isVideo = item.url.endsWith('.mp4') || item.url.endsWith('.webm');
  const [src, setSrc] = useState(item.url);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    loadMedia({
      eventId,
      authorPubkey,
      source: { url: item.url, magnet: item.magnet, sha256: item.sha256, type: 'media' },
      timeoutMs: isVideo ? 4000 : 1500
    })
      .then((result) => {
        if (!active) return;
        setSrc(result.url);
      })
      .catch(() => null);
    return () => {
      active = false;
    };
  }, [authorPubkey, eventId, item.magnet, item.sha256, item.url, loadMedia]);

  return (
    <div className={`post-media-shell ${loaded ? 'loaded' : ''} ${isVideo ? 'video' : 'image'}`}>
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
