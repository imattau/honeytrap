import React, { useEffect, useState } from 'react';
import { X, Paperclip, UploadCloud, Trash2, Send } from 'lucide-react';
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
  mediaRelays?: string[];
  onUpload?: (file: File, relay: string) => Promise<{ url: string; sha256?: string }>;
}

export function Composer({ open, replyTo, onClose, onSubmit, mediaRelays = [], onUpload }: ComposerProps) {
  const [content, setContent] = useState('');
  const [media, setMedia] = useState<ComposerInput['media']>([]);
  const [selectedRelay, setSelectedRelay] = useState(mediaRelays[0] ?? '');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  useEffect(() => {
    if (!selectedRelay && mediaRelays.length > 0) {
      setSelectedRelay(mediaRelays[0]);
    }
  }, [mediaRelays, selectedRelay]);

  const handleUpload = async (file?: File) => {
    if (!file) return;
    if (!selectedRelay) {
      setError('Select a media relay');
      return;
    }
    if (!onUpload) {
      setError('Upload service unavailable');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const result = await onUpload(file, selectedRelay);
      setMedia((prev) => [...prev, { url: result.url, sha256: result.sha256 }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
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
      const fallback = replyTo ? 'Unable to send reply' : 'Unable to publish';
      setError(err instanceof Error ? err.message : fallback);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="composer-backdrop">
      <div className="composer-panel">
        <div className="composer-header">
          <div className="composer-title">{replyTo ? 'Reply' : 'New Post'}</div>
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
          placeholder={replyTo ? 'Write your reply…' : 'Write a new post…'}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          rows={5}
        />
        <div className="composer-media">
          <div className="composer-row">
            <label><Paperclip size={14} /> Media Relay</label>
            <div className="composer-row-inline">
              <select
                className="composer-select"
                value={selectedRelay}
                onChange={(event) => setSelectedRelay(event.target.value)}
              >
                {mediaRelays.length === 0 && <option value="">No media relays</option>}
                {mediaRelays.map((relay) => (
                  <option key={relay} value={relay}>{relay}</option>
                ))}
              </select>
              <label className="composer-icon" aria-label="Upload media">
                <UploadCloud size={16} />
                <input
                  type="file"
                  className="composer-file"
                  onChange={(event) => handleUpload(event.target.files?.[0])}
                />
              </label>
            </div>
            {uploading && <div className="composer-sub">Uploading…</div>}
          </div>
          {media.length > 0 && (
            <div className="composer-media-list">
              {media.map((item) => (
                <div className="composer-media-chip" key={item.url}>
                  <span>{item.url}</span>
                  <button
                    className="composer-icon"
                    aria-label="Remove media"
                    onClick={() => setMedia((prev) => prev.filter((entry) => entry.url !== item.url))}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <button className="composer-button primary" onClick={handleSubmit} disabled={saving}>
          <Send size={16} /> {saving ? 'Sending…' : replyTo ? 'Send reply' : 'Publish'}
        </button>
      </div>
    </div>
  );
}
