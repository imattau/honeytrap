import React, { useMemo, useState } from 'react';
import { X, Zap } from 'lucide-react';
import { Button } from './Button';
import { FormGroup } from './FormGroup';

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
        <div className="zap-header mb-2">
          <div className="zap-title">Send Zap</div>
          <button type="button" className="zap-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="zap-presets mb-4">
          {resolvedPresets.map((value) => (
            <button
              key={value}
              type="button"
              className={`zap-chip ${amount === value ? 'active' : ''}`}
              onClick={() => handlePreset(value)}
            >
              <Zap size={14} /> {value}
            </button>
          ))}
        </div>
        
        <FormGroup
          label="Custom amount"
          value={custom}
          onChange={handleCustomChange}
          placeholder="Custom sats"
          className="mb-4"
        />

        <FormGroup
          label="Comment (optional)"
          type="textarea"
          value={comment}
          onChange={setComment}
          className="mb-4"
        />

        {error && <div className="zap-error mb-2 text-red-400 font-medium">{error}</div>}
        
        <Button
          variant="primary"
          onClick={handleSend}
          isLoading={sending}
          disabled={!amount}
          className="w-full"
          leftIcon={!sending && <Zap size={16} />}
        >
          Send Zap
        </Button>
      </div>
    </div>
  );
}
