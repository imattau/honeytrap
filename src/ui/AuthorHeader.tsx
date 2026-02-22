import React from 'react';
import { ArrowLeft, UserCheck, UserPlus, Ban, Globe, BadgeCheck, Zap } from 'lucide-react';
import { IconButton } from './IconButton';
import { shortenId } from './utils';
import { Card } from './Card';
import type { ProfileMetadata } from '../nostr/types';

interface AuthorHeaderProps {
  pubkey: string;
  profile?: ProfileMetadata;
  followersCount: number;
  followingCount: number;
  followed: boolean;
  blocked: boolean;
  onBack: () => void;
  onFollowToggle: () => void;
  onBlockToggle: () => void;
}

const fallbackAvatar = '/assets/honeytrap_logo_256.png';

export const AuthorHeader: React.FC<AuthorHeaderProps> = ({
  pubkey,
  profile,
  followersCount,
  followingCount,
  followed,
  blocked,
  onBack,
  onFollowToggle,
  onBlockToggle
}) => {
  return (
    <div className="author-header">
      <button className="author-back" onClick={onBack} aria-label="Back">
        <ArrowLeft size={18} />
      </button>
      {profile?.banner && (
        <div className="author-banner">
                        <img src={profile.banner} alt="Profile banner" />
                      </div>
                    )}
                    <Card className="author-card-root">
                      {profile?.picture ? (
                        <img src={profile.picture} alt="avatar" className="author-avatar" />
                      ) : (
                        <img src={fallbackAvatar} alt="avatar" className="author-avatar fallback" />
                      )}
                      <div>
                        <div className="author-name">{profile?.display_name ?? profile?.name ?? shortenId(pubkey, 12)}</div>
                        <div className="author-sub">{pubkey}</div>
                        {profile?.about && <div className="author-about">{profile.about}</div>}
                        <div className="author-stats">
                          <span><strong>{followersCount}</strong> followers</span>
                          <span><strong>{followingCount}</strong> following</span>
                        </div>
                        <div className="author-meta">
                          {profile?.nip05 && (
                            <a className="author-meta-item" href={`https://${profile.nip05.split('@')[1] ?? ''}`} target="_blank" rel="noreferrer">
                              <BadgeCheck size={14} /> {profile.nip05}
                            </a>
                          )}
                          {profile?.website && (
                            <a className="author-meta-item" href={normalizeWebsite(profile.website)} target="_blank" rel="noreferrer">
                              <Globe size={14} /> {profile.website}
                            </a>
                          )}
                          {profile?.lud16 && (
                            <span className="author-meta-item">
                              <Zap size={14} /> {profile.lud16}
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
                        </div>
                      </div>
                    </Card>
                  </div>  );
};

function normalizeWebsite(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '#';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
