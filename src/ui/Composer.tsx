import React, { useState } from 'react';
import { X, Paperclip, Magnet, Hash } from 'lucide-react';
import type { NostrEvent } from '../nostr/types';

export interface ComposerInput {
  content: string;
  media: { url: string; magnet?: string; sha256?: string }[];
}

interface ComposerProps {
  open: boolean;
  replyTo?: NostrEvent;
  onClose: () => void;
  onSubmit: (input: ComposerInput) => Promise<void>;
}

export function Composer({ open, replyTo, onClose, onSubmit }: ComposerProps) {
  const [content, setContent] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaMagnet, setMediaMagnet] = useState('');
  const [mediaSha, setMediaSha] = useState('');
  const [media, setMedia] = useState<ComposerInput['media']>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleAddMedia = () => {
    if (!mediaUrl.trim()) return;
    setMedia((prev) => [
      ...prev,
      { url: mediaUrl.trim(), magnet: mediaMagnet.trim() || undefined, sha256: mediaSha.trim() || undefined }
    ]);
    setMediaUrl('');
    setMediaMagnet('');
    setMediaSha('');
  };

  const handleSubmit = async () => {
    if (!content.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ content: content.trim(), media });
      setContent('');
      setMedia([]);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send reply');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="composer-backdrop">
      <div className="composer-panel">
        <div className="composer-header">
          <div className="composer-title">Reply</div>
          <button className="composer-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        {replyTo && (
          <div className="composer-reply">Replying to {replyTo.pubkey.slice(0, 10)}…</div>
        )}
        {error && <div className="composer-error">{error}</div>}
        <textarea
          className="composer-textarea"
          placeholder="Write your reply…"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          rows={5}
        />
        <div className="composer-media">
          <div className="composer-row">
            <label><Paperclip size={14} /> Media URL</label>
            <input value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} />
          </div>
          <div className="composer-row">
            <label><Magnet size={14} /> Magnet (optional)</label>
            <input value={mediaMagnet} onChange={(e) => setMediaMagnet(e.target.value)} />
          </div>
          <div className="composer-row">
            <label><Hash size={14} /> SHA256 (optional)</label>
            <input value={mediaSha} onChange={(e) => setMediaSha(e.target.value)} />
          </div>
          <button className="composer-button" onClick={handleAddMedia}>Add media</button>
          {media.length > 0 && (
            <div className="composer-media-list">
              {media.map((item) => (
                <div key={item.url}>{item.url}</div>
              ))}
            </div>
          )}
        </div>
        <button className="composer-button primary" onClick={handleSubmit} disabled={saving}>
          {saving ? 'Sending…' : 'Send reply'}
        </button>
      </div>
    </div>
  );
}
