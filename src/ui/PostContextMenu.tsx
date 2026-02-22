import React from 'react';
import { Copy } from 'lucide-react';
import { clamp } from './utils';

interface PostContextMenuProps {
  position: { x: number; y: number };
  onClose: () => void;
  onCopyEventId: () => Promise<void>;
  onCopyAuthor: () => Promise<void>;
  onCopyRaw: () => Promise<void>;
}

export const PostContextMenu: React.FC<PostContextMenuProps> = ({
  position,
  onClose,
  onCopyEventId,
  onCopyAuthor,
  onCopyRaw
}) => {
  return (
    <div className="post-context-layer" onClick={onClose}>
      <div
        className="post-context-menu"
        style={{
          left: clamp(position.x, 14, window.innerWidth - 210),
          top: clamp(position.y, 14, window.innerHeight - 160)
        }}
        onClick={(eventArg) => eventArg.stopPropagation()}
      >
        <button
          className="post-context-item"
          onClick={() => {
            onCopyEventId().catch(() => null);
            onClose();
          }}
        >
          <Copy size={14} /> Copy event ID
        </button>
        <button
          className="post-context-item"
          onClick={() => {
            onCopyAuthor().catch(() => null);
            onClose();
          }}
        >
          <Copy size={14} /> Copy npub
        </button>
        <button
          className="post-context-item"
          onClick={() => {
            onCopyRaw().catch(() => null);
            onClose();
          }}
        >
          <Copy size={14} /> Copy raw JSON
        </button>
      </div>
    </div>
  );
};
