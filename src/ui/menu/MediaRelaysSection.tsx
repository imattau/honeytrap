import React from 'react';
import { Server, Save } from 'lucide-react';
import { MenuSection } from './MenuSection';

interface MediaRelaysSectionProps {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  saved?: boolean;
}

export function MediaRelaysSection({ value, onChange, onSave, saved }: MediaRelaysSectionProps) {
  return (
    <MenuSection title="Media Relays" icon={<Server size={16} />}>
      <label className="menu-label">Blossom/Media Relay URLs</label>
      <textarea
        className="menu-textarea"
        rows={3}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button className={`menu-button ${saved ? 'menu-button--saved' : ''}`} onClick={onSave}>
        <Save size={14} /> Save media relays
      </button>
    </MenuSection>
  );
}
