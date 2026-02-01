import React from 'react';
import { Reply, Repeat2, Heart, Zap, Share2 } from 'lucide-react';

export interface PostActionsProps {
  onReply?: () => void;
  onRepost?: () => void;
  onLike?: () => void;
  onZap?: () => void;
  onShare?: () => void;
}

export function PostActions({ onReply, onRepost, onLike, onZap, onShare }: PostActionsProps) {
  return (
    <div className="post-actions">
      <button className="action-icon" onClick={onReply} aria-label="Reply">
        <Reply size={16} />
      </button>
      <button className="action-icon" onClick={onRepost} aria-label="Repost">
        <Repeat2 size={16} />
      </button>
      <button className="action-icon" onClick={onLike} aria-label="Like">
        <Heart size={16} />
      </button>
      <button className="action-icon" onClick={onZap} aria-label="Zap">
        <Zap size={16} />
      </button>
      <button className="action-icon" onClick={onShare} aria-label="Share">
        <Share2 size={16} />
      </button>
    </div>
  );
}
