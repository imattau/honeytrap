import React, { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Virtuoso } from 'react-virtuoso';
import { useNavigate, useParams } from 'react-router-dom';
import type { NostrEvent, ProfileMetadata } from '../nostr/types';
import { useAppState } from './AppState';
import { PostCard } from './PostCard';
import { FabButton } from './FabButton';
import { Composer } from './Composer';
import { decodeKey } from '../nostr/auth';
import { openThread } from './threadNavigation';
import { AuthorHeader } from './AuthorHeader';
import { EmptyState } from './EmptyState';
import { FileX } from 'lucide-react';

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
        if (active) setLoading(false);
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
  const followed = resolvedPubkey ? isFollowed(resolvedPubkey) : false;
  const blocked = resolvedPubkey ? isBlocked(resolvedPubkey) : false;

  const handleBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) {
      flushSync(() => navigate(-1));
    } else {
      flushSync(() => navigate('/'));
    }
  };

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
            <AuthorHeader
              pubkey={resolvedPubkey}
              profile={displayProfile}
              followersCount={followersCount}
              followingCount={followingCount}
              followed={followed}
              blocked={blocked}
              onBack={handleBack}
              onFollowToggle={() => resolvedPubkey && toggleFollow(resolvedPubkey)}
              onBlockToggle={() => resolvedPubkey && toggleBlock(resolvedPubkey)}
            />
          ),
          EmptyPlaceholder: () => (
            <EmptyState
              title={loading ? 'Loading posts…' : 'No posts yet'}
              message={loading ? 'Fetching history from relays.' : 'This author hasn\'t published any notes yet.'}
              loading={loading}
              icon={FileX}
            />
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
