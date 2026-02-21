import React, { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Virtuoso } from 'react-virtuoso';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, UserCheck, UserPlus, Ban, Globe, BadgeCheck, Zap } from 'lucide-react';
import type { NostrEvent, ProfileMetadata } from '../nostr/types';
import { useAppState } from './AppState';
import { PostCard } from './PostCard';
import { FabButton } from './FabButton';
import { Composer } from './Composer';
import { decodeKey } from '../nostr/auth';
import { IconButton } from './IconButton';
import { openThread } from './threadNavigation';

export function AuthorView() {
  const { pubkey } = useParams<{ pubkey: string }>();
  const navigate = useNavigate();
  const {
    authorService,
    profiles,
    selectEvent,
    isFollowed,
    isBlocked,
    toggleFollow,
    toggleBlock,
    publishPost,
    publishReply,
    mediaRelayList,
    settings,
    attachMedia,
    fetchFollowersFor,
    fetchFollowingFor,
    mergeProfiles
  } = useAppState();
  const [events, setEvents] = useState<NostrEvent[]>([]);
  const [profile, setProfile] = useState<ProfileMetadata | undefined>(undefined);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<NostrEvent | undefined>(undefined);
  const eventsRef = useRef<NostrEvent[]>([]);
  const resolvedPubkey = useMemo(() => {
    if (!pubkey) return '';
    if (pubkey.startsWith('npub')) {
      try {
        return decodeKey(pubkey).npub;
      } catch {
        return pubkey;
      }
    }
    return pubkey;
  }, [pubkey]);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  useEffect(() => {
    if (!resolvedPubkey) {
      eventsRef.current = [];
      setEvents([]);
      setProfile(undefined);
      setLoading(false);
      return;
    }
    eventsRef.current = [];
    setEvents([]);
    setProfile(undefined);
    setLoading(true);
    let active = true;
    authorService.subscribeAuthorFeed(
      resolvedPubkey,
      () => eventsRef.current,
      (next) => {
        if (!active) return;
        setEvents(next);
        if (next.length > 0) setLoading(false);
      },
      (incoming) => {
        if (!active) return;
        mergeProfiles(incoming);
      }
    );
    authorService.loadProfile(resolvedPubkey)
      .then((loaded) => {
        if (!active) return;
        setProfile(loaded);
      })
      .catch(() => null)
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });
    Promise.all([
      fetchFollowersFor(resolvedPubkey).catch(() => [] as string[]),
      fetchFollowingFor(resolvedPubkey).catch(() => [] as string[])
    ])
      .then(([followers, following]) => {
        if (!active) return;
        setFollowersCount(followers.length);
        setFollowingCount(following.length);
      })
      .catch(() => null);
    return () => {
      active = false;
      authorService.stop();
      setEvents([]);
      setLoading(true);
    };
  }, [authorService, fetchFollowersFor, fetchFollowingFor, mergeProfiles, resolvedPubkey]);

  const displayProfile = useMemo(() => profiles[resolvedPubkey] ?? profile, [profiles, profile, resolvedPubkey]);
  const fallbackAvatar = '/assets/honeytrap_logo_256.png';
  const followed = resolvedPubkey ? isFollowed(resolvedPubkey) : false;
  const blocked = resolvedPubkey ? isBlocked(resolvedPubkey) : false;

  return (
    <div className="author-view">
      <div className={`progress-line ${loading ? 'active' : ''}`} aria-hidden="true" />
      <Virtuoso
        className="feed-virtuoso"
        data={events}
        computeItemKey={(_, event) => event.id}
        overscan={600}
        components={{
          Header: () => (
            <div className="author-header">
              <button className="author-back" onClick={() => {
                const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
                if (idx > 0) { flushSync(() => navigate(-1)); } else { flushSync(() => navigate('/')); }
              }} aria-label="Back">
                <ArrowLeft size={18} />
              </button>
              {displayProfile?.banner && (
                <div className="author-banner">
                  <img src={displayProfile.banner} alt="Profile banner" />
                </div>
              )}
              <div className="author-card">
                {displayProfile?.picture ? (
                  <img src={displayProfile.picture} alt="avatar" className="author-avatar" />
                ) : (
                  <img src={fallbackAvatar} alt="avatar" className="author-avatar fallback" />
                )}
                <div>
                  <div className="author-name">{displayProfile?.display_name ?? displayProfile?.name ?? resolvedPubkey.slice(0, 12)}</div>
                  <div className="author-sub">{resolvedPubkey}</div>
                  {displayProfile?.about && <div className="author-about">{displayProfile.about}</div>}
                  <div className="author-stats">
                    <span><strong>{followersCount}</strong> followers</span>
                    <span><strong>{followingCount}</strong> following</span>
                  </div>
                  <div className="author-meta">
                    {displayProfile?.nip05 && (
                      <a className="author-meta-item" href={`https://${displayProfile.nip05.split('@')[1] ?? ''}`} target="_blank" rel="noreferrer">
                        <BadgeCheck size={14} /> {displayProfile.nip05}
                      </a>
                    )}
                    {displayProfile?.website && (
                      <a className="author-meta-item" href={normalizeWebsite(displayProfile.website)} target="_blank" rel="noreferrer">
                        <Globe size={14} /> {displayProfile.website}
                      </a>
                    )}
                    {displayProfile?.lud16 && (
                      <span className="author-meta-item">
                        <Zap size={14} /> {displayProfile.lud16}
                      </span>
                    )}
                  </div>
                  <div className="author-controls">
                    <IconButton
                      title={followed ? 'Unfollow' : 'Follow'}
                      ariaLabel={followed ? 'Unfollow' : 'Follow'}
                      active={followed}
                      tone="follow"
                      variant="author"
                      onClick={() => resolvedPubkey && toggleFollow(resolvedPubkey)}
                    >
                      {followed ? <UserCheck size={14} /> : <UserPlus size={14} />}
                    </IconButton>
                    <IconButton
                      title={blocked ? 'Unblock' : 'Block'}
                      ariaLabel={blocked ? 'Unblock' : 'Block'}
                      active={blocked}
                      tone="block"
                      variant="author"
                      onClick={() => resolvedPubkey && toggleBlock(resolvedPubkey)}
                    >
                      <Ban size={14} />
                    </IconButton>
                  </div>
                </div>
              </div>
            </div>
          ),
          EmptyPlaceholder: () => (
            <div className="author-empty">
              {loading ? 'Loading posts…' : 'No posts yet.'}
            </div>
          )
        }}
        endReached={() => resolvedPubkey ? authorService.loadOlder(resolvedPubkey, () => eventsRef.current, setEvents) : Promise.resolve()}
        itemContent={(_, event) => (
          <div className="feed-item">
            <PostCard
              event={event}
              profile={profiles[event.pubkey] ?? profile}
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
    </div>
  );
}

function normalizeWebsite(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '#';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
