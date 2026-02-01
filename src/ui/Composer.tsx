import React, { useEffect, useState } from 'react';
import { X, Paperclip, UploadCloud, Trash2, Send, Link2, Plus } from 'lucide-react';
import type { NostrEvent } from '../nostr/types';

export interface ComposerInput {
  content: string;
  media: { url: string; magnet?: string; sha256?: string }[];
}

interface ComposerProps {
  open: boolean;
  replyTo?: NostrEvent;
  onClose: () => void;
  onSubmit: (input: ComposerInput) => Promise<void | NostrEvent>;
  mediaRelays?: string[];
  onAttachMedia?: (files: File[], mode: 'relay' | 'p2p', options: { relays: string[]; preferredRelay?: string; onProgress?: (percent: number) => void }) => Promise<{ url: string; sha256?: string; magnet?: string }[]>;
}

export function Composer({ open, replyTo, onClose, onSubmit, mediaRelays = [], onAttachMedia }: ComposerProps) {
  const [content, setContent] = useState('');
  const [media, setMedia] = useState<ComposerInput['media']>([]);
  const [selectedRelay, setSelectedRelay] = useState(mediaRelays[0] ?? '');
  const [manualUrl, setManualUrl] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadState, setUploadState] = useState<{ index: number; total: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedRelay && mediaRelays.length > 0) {
      setSelectedRelay(mediaRelays[0]);
    }
  }, [mediaRelays, selectedRelay]);

  if (!open) return null;

  const handleUpload = async (files?: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!selectedRelay) {
      setError('Select a media relay');
      return;
    }
    if (!onAttachMedia) {
      setError('Upload service unavailable');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const list = Array.from(files);
      for (let i = 0; i < list.length; i += 1) {
        const file = list[i];
        setUploadState({ index: i + 1, total: list.length });
        setUploadProgress(0);
        const mode = selectedRelay === '__p2p__' ? 'p2p' : 'relay';
        const results = await onAttachMedia([file], mode, {
          relays: mediaRelays,
          preferredRelay: selectedRelay === '__p2p__' ? undefined : selectedRelay,
          onProgress: (percent) => setUploadProgress(percent)
        });
        results.forEach((result) => {
          setMedia((prev) => [...prev, { url: result.url, sha256: result.sha256, magnet: result.magnet }]);
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadState(null);
      setUploadProgress(0);
      setUploading(false);
    }
  };

  const handleAddManual = () => {
    if (!manualUrl.trim()) return;
    setMedia((prev) => [...prev, { url: manualUrl.trim() }]);
    setManualUrl('');
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
                onChange={(event) => {
                  setSelectedRelay(event.target.value);
                  if (error) setError(null);
                }}
              >
                {onAttachMedia && <option value="__p2p__">P2P only (seed locally)</option>}
                {mediaRelays.length === 0 && <option value="">No media relays</option>}
                {mediaRelays.map((relay) => (
                  <option key={relay} value={relay}>{relay}</option>
                ))}
              </select>
              <label className="composer-icon" aria-label="Upload media">
                <UploadCloud size={16} />
                <input
                  type="file"
                  multiple
                  className="composer-file"
                  onChange={(event) => handleUpload(event.target.files)}
                />
              </label>
              <button
                className={`composer-icon ${showManual ? 'active' : ''}`}
                onClick={() => setShowManual((prev) => !prev)}
                aria-label="Add media URL"
              >
                <Link2 size={16} />
              </button>
            </div>
            {uploading && uploadState && (
              <div className="composer-sub">
                Uploading {uploadState.index}/{uploadState.total} — {uploadProgress}%
              </div>
            )}
            {uploading && (
              <div className="composer-progress">
                <div className="composer-progress-bar" style={{ width: `${uploadProgress}%` }} />
              </div>
            )}
          </div>
          {showManual && (
            <div className="composer-row">
              <label><Link2 size={14} /> Media URL</label>
              <div className="composer-row-inline">
                <input
                  value={manualUrl}
                  onChange={(event) => setManualUrl(event.target.value)}
                  placeholder="https://…"
                />
                <button className="composer-icon" onClick={handleAddManual} aria-label="Add media URL">
                  <Plus size={16} />
                </button>
              </div>
            </div>
          )}
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
