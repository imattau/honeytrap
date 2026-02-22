import React from 'react';
import { Reply, Repeat2, Heart, Zap, Share2 } from 'lucide-react';

export interface PostActionsProps {
  onReply?: () => void;
  onRepost?: () => void;
  onLike?: () => void;
  onZap?: () => void;
  onShare?: () => void;
  reposted?: boolean;
  liked?: boolean;
  shared?: boolean;
  disabled?: boolean;
}

export function PostActions({ onReply, onRepost, onLike, onZap, onShare, reposted, liked, shared, disabled }: PostActionsProps) {
  return (
    <div className="post-actions">
      <button
        type="button"
        className="action-icon"
        onClick={(e) => {
          e.stopPropagation();
          onReply?.();
        }}
        aria-label="Reply"
        disabled={disabled}
      >
        <Reply size={16} />
      </button>
      <button
        type="button"
        className={`action-icon ${reposted ? 'is-active is-repost' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          onRepost?.();
        }}
        aria-label="Repost"
        disabled={disabled}
      >
        <Repeat2 size={16} />
      </button>
      <button
        type="button"
        className={`action-icon ${liked ? 'is-active is-like' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          onLike?.();
        }}
        aria-label="Like"
        disabled={disabled}
      >
        <Heart size={16} />
      </button>
      <button
        type="button"
        className="action-icon"
        onClick={(e) => {
          e.stopPropagation();
          onZap?.();
        }}
        aria-label="Zap"
        disabled={disabled}
      >
        <Zap size={16} />
      </button>
      <button
        type="button"
        className={`action-icon ${shared ? 'is-active is-share' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          onShare?.();
        }}
        aria-label="Share"
        disabled={disabled}
      >
        <Share2 size={16} />
      </button>
    </div>
  );
}
