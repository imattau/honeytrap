import React from 'react';
import { Wallet, Save } from 'lucide-react';
import { MenuSection } from './MenuSection';

interface WalletSectionProps {
  lnurl: string;
  presetsInput: string;
  nwc: string;
  onLnurlChange: (value: string) => void;
  onPresetsChange: (value: string) => void;
  onNwcChange: (value: string) => void;
  onSave: () => void;
  saved?: boolean;
}

export function WalletSection({
  lnurl,
  presetsInput,
  nwc,
  onLnurlChange,
  onPresetsChange,
  onNwcChange,
  onSave,
  saved
}: WalletSectionProps) {
  return (
    <MenuSection title="Wallet" icon={<Wallet size={16} />}>
      <div className="menu-row">
        <label className="menu-label">LNURL / deep link</label>
        <input
          className="menu-input"
          value={lnurl}
          onChange={(event) => onLnurlChange(event.target.value)}
          placeholder="lightning: or lnurl…"
        />
      </div>
      <div className="menu-row">
        <label className="menu-label">Zap presets (comma separated)</label>
        <input
          className="menu-input"
          value={presetsInput}
          onChange={(event) => onPresetsChange(event.target.value)}
          placeholder="100, 500, 1000"
        />
      </div>
      <div className="menu-row">
        <label className="menu-label">NWC URI</label>
        <input
          className="menu-input"
          value={nwc}
          onChange={(event) => onNwcChange(event.target.value)}
          placeholder="nostr+walletconnect://..."
        />
      </div>
      <button className={`menu-button ${saved ? 'menu-button--saved' : ''}`} onClick={onSave}>
        <Save size={14} /> Save wallet
      </button>
    </MenuSection>
  );
}
