import React from 'react';
import { Wifi, Save } from 'lucide-react';
import { MenuSection } from './MenuSection';

interface NostrRelaysSectionProps {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  saved?: boolean;
  onToggle?: (open: boolean) => void;
  relayStatus?: Record<string, boolean>;
}

export function NostrRelaysSection({
  value,
  onChange,
  onSave,
  saved,
  onToggle,
  relayStatus = {}
}: NostrRelaysSectionProps) {
  const relays = value
    .split(/\n|,/)
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <MenuSection title="Nostr Relays" icon={<Wifi size={16} />} onToggle={onToggle}>
      <label className="menu-label">Relay URLs</label>
      <textarea
        className="menu-textarea"
        rows={3}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button className={`menu-button ${saved ? 'menu-button--saved' : ''}`} onClick={onSave}>
        <Save size={14} /> Save relays
      </button>
      <div className="relay-status-list">
        {relays.map((relay) => (
          <div key={relay} className={`relay-status ${relayStatus[relay] ? 'ok' : 'bad'}`}>
            <span className="relay-dot" />
            {relay}
          </div>
        ))}
      </div>
    </MenuSection>
  );
}
