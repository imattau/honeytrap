import React, { useMemo, useState } from 'react';
import { X, Zap } from 'lucide-react';

interface ZapComposerProps {
  open: boolean;
  presets: number[];
  onClose: () => void;
  onSend: (amountSats: number, comment?: string) => Promise<void>;
}

export function ZapComposer({ open, presets, onClose, onSend }: ZapComposerProps) {
  const [amount, setAmount] = useState<number | null>(null);
  const [custom, setCustom] = useState('');
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolvedPresets = useMemo(() => presets.filter((value) => value > 0), [presets]);

  if (!open) return null;

  const handlePreset = (value: number) => {
    setAmount(value);
    setCustom('');
  };

  const handleCustomChange = (value: string) => {
    setCustom(value);
    const parsed = Number(value);
    setAmount(Number.isFinite(parsed) ? parsed : null);
  };

  const handleSend = async () => {
    if (!amount || amount <= 0) return;
    setSending(true);
    setError(null);
    try {
      await onSend(amount, comment.trim() || undefined);
      onClose();
      setComment('');
      setCustom('');
      setAmount(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Zap failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="zap-backdrop">
      <div className="zap-panel">
        <div className="zap-header">
          <div className="zap-title">Send Zap</div>
          <button className="zap-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="zap-presets">
          {resolvedPresets.map((value) => (
            <button
              key={value}
              className={`zap-chip ${amount === value ? 'active' : ''}`}
              onClick={() => handlePreset(value)}
            >
              <Zap size={14} /> {value} sats
            </button>
          ))}
        </div>
        <label className="zap-label">Custom amount</label>
        <input
          className="zap-input"
          value={custom}
          onChange={(event) => handleCustomChange(event.target.value)}
          placeholder="Custom sats"
        />
        <label className="zap-label">Comment (optional)</label>
        <textarea
          className="zap-textarea"
          rows={3}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
        />
        {error && <div className="zap-error">{error}</div>}
        <button className="zap-send" onClick={handleSend} disabled={sending || !amount}>
          {sending ? 'Sending…' : 'Send Zap'}
        </button>
      </div>
    </div>
  );
}
