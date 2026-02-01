import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, UserCheck, UserPlus, Ban } from 'lucide-react';
import type { NostrEvent, ProfileMetadata } from '../nostr/types';
import { useAppState } from './AppState';
import { PostCard } from './PostCard';
import { decodeKey } from '../nostr/auth';
import { IconButton } from './IconButton';

export function AuthorView() {
  const { pubkey } = useParams<{ pubkey: string }>();
  const navigate = useNavigate();
  const { authorService, profiles, selectEvent, isFollowed, isBlocked, toggleFollow, toggleBlock } = useAppState();
  const [events, setEvents] = useState<NostrEvent[]>([]);
  const [profile, setProfile] = useState<ProfileMetadata | undefined>(undefined);
  const [loading, setLoading] = useState(true);
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
    if (!resolvedPubkey) return;
    authorService.subscribeAuthorFeed(
      resolvedPubkey,
      () => eventsRef.current,
      (next) => {
        setEvents(next);
        if (next.length > 0) setLoading(false);
      },
      () => null
    );
    authorService.loadProfile(resolvedPubkey).then(setProfile).catch(() => null);
    return () => {
      authorService.stop();
      setEvents([]);
      setLoading(true);
    };
  }, [authorService, resolvedPubkey]);

  const displayProfile = useMemo(() => profiles[resolvedPubkey] ?? profile, [profiles, profile, resolvedPubkey]);
  const fallbackAvatar = '/assets/honeytrap_logo_256.png';
  const followed = resolvedPubkey ? isFollowed(resolvedPubkey) : false;
  const blocked = resolvedPubkey ? isBlocked(resolvedPubkey) : false;

  return (
    <div className="author-view">
      <div className={`progress-line ${loading ? 'active' : ''}`} aria-hidden="true" />
      <div className="author-header">
        <button className="author-back" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft size={18} />
        </button>
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
      <Virtuoso
        className="feed-virtuoso"
        data={events}
        overscan={600}
        components={{
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
              onOpenThread={() => navigate(`/thread/${event.id}`, { state: { event } })}
            />
          </div>
        )}
      />
    </div>
  );
}
