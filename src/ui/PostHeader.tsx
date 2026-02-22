import React from 'react';
import { Radio, Bolt, Link2, ShieldCheck, UserPlus, UserCheck, Ban, AlertTriangle } from 'lucide-react';
import { IconButton } from './IconButton';
import { formatTimestamp } from './utils';
import type { NostrEvent, ProfileMetadata } from '../nostr/types';
import type { TransportStatus } from '../nostr/transportTypes';

interface PostHeaderProps {
  event: NostrEvent;
  authorProfile?: ProfileMetadata;
  followed: boolean;
  blocked: boolean;
  nsfwAuthor: boolean;
  status: TransportStatus;
  onAuthorClick: (e: React.MouseEvent) => void;
  onFollowToggle: (e: React.MouseEvent) => void;
  onBlockToggle: (e: React.MouseEvent) => void;
  onNsfwToggle: (e: React.MouseEvent) => void;
}

const fallbackAvatar = '/assets/honeytrap_logo_256.png';

export const PostHeader: React.FC<PostHeaderProps> = ({
  event,
  authorProfile,
  followed,
  blocked,
  nsfwAuthor,
  status,
  onAuthorClick,
  onFollowToggle,
  onBlockToggle,
  onNsfwToggle
}) => {
  return (
    <header className="post-header">
      <div className="post-author">
        {authorProfile?.picture ? (
          <img
            src={authorProfile.picture}
            alt="avatar"
            className="post-avatar"
            width={44}
            height={44}
            decoding="async"
            onClick={onAuthorClick}
          />
        ) : (
          <img
            src={fallbackAvatar}
            alt="avatar"
            className="post-avatar fallback"
            width={44}
            height={44}
            decoding="async"
            onClick={onAuthorClick}
          />
        )}
        <div>
          <button
            type="button"
            className="post-name"
            onClick={onAuthorClick}
          >
            {authorProfile?.display_name ?? authorProfile?.name ?? event.pubkey.slice(0, 12)}
          </button>
          <div className="post-time">{formatTimestamp(event.created_at)}</div>
        </div>
        <div className="author-actions">
          <IconButton
            title={followed ? 'Unfollow' : 'Follow'}
            ariaLabel={followed ? 'Unfollow' : 'Follow'}
            active={followed}
            tone="follow"
            variant="author"
            onClick={onFollowToggle}
          >
            {followed ? <UserCheck size={14} /> : <UserPlus size={14} />}
          </IconButton>
          <IconButton
            title={blocked ? 'Unblock' : 'Block'}
            ariaLabel={blocked ? 'Unblock' : 'Block'}
            active={blocked}
            tone="block"
            variant="author"
            onClick={onBlockToggle}
          >
            <Ban size={14} />
          </IconButton>
          <IconButton
            title={nsfwAuthor ? 'Unmark NSFW author' : 'Mark NSFW author'}
            ariaLabel={nsfwAuthor ? 'Unmark NSFW author' : 'Mark NSFW author'}
            active={nsfwAuthor}
            tone="nsfw"
            variant="author"
            onClick={onNsfwToggle}
          >
            <AlertTriangle size={14} />
          </IconButton>
        </div>
      </div>
      <div className="post-icons">
        <IconButton title="Relay" ariaLabel="Relay" active={Boolean(status.relay)} tone="relay">
          <Radio size={16} />
        </IconButton>
        <IconButton
          title="P2P assist"
          ariaLabel="P2P assist"
          active={Boolean(status.p2p)}
          tone="p2p"
          className={status.p2p ? 'icon-btn--p2p-live' : undefined}
        >
          <Bolt size={16} />
        </IconButton>
        <IconButton title="HTTP fallback" ariaLabel="HTTP fallback" active={Boolean(status.http)} tone="http">
          <Link2 size={16} />
        </IconButton>
        <IconButton title="Verified" ariaLabel="Verified" active={Boolean(status.verified)} tone="verified">
          <ShieldCheck size={16} />
        </IconButton>
      </div>
    </header>
  );
};
