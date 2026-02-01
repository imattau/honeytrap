import React from 'react';
import { Bolt, Globe2, Save } from 'lucide-react';
import type { P2PSettings } from '../../storage/types';
import { MenuSection } from './MenuSection';

interface TorrentSectionProps {
  value: P2PSettings;
  onChange: (patch: Partial<P2PSettings>) => void;
  onSave: () => void;
  saved?: boolean;
}

export function TorrentSection({ value, onChange, onSave, saved }: TorrentSectionProps) {
  return (
    <MenuSection title="BitTorrent Assist" icon={<Bolt size={16} />}>
      <div className="menu-toggle-row">
        <label className="menu-toggle">
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(event) => onChange({ enabled: event.target.checked })}
          />
          <span>Enable P2P assist</span>
        </label>
        <label className="menu-toggle">
          <input
            type="checkbox"
            checked={value.seedWhileOpen}
            onChange={(event) => onChange({ seedWhileOpen: event.target.checked })}
          />
          <span>Seed while open</span>
        </label>
      </div>
      <div className="menu-toggle-row">
        <label className="menu-toggle">
          <input
            type="checkbox"
            checked={value.preferMedia}
            onChange={(event) => onChange({ preferMedia: event.target.checked })}
          />
          <span>Prefer P2P for media</span>
        </label>
        <label className="menu-toggle">
          <input
            type="checkbox"
            checked={value.preferEvents}
            onChange={(event) => onChange({ preferEvents: event.target.checked })}
          />
          <span>Prefer P2P for events</span>
        </label>
      </div>
      <div className="menu-row">
        <label className="menu-label"><Globe2 size={14} /> P2P scope</label>
        <select
          className="menu-select"
          value={value.scope}
          onChange={(event) => onChange({ scope: event.target.value as P2PSettings['scope'] })}
        >
          <option value="follows">Follows only</option>
          <option value="everyone">Everyone</option>
        </select>
      </div>
      <div className="menu-row">
        <label className="menu-label">Max concurrent torrents</label>
        <input
          className="menu-input"
          type="number"
          min={1}
          max={15}
          value={value.maxConcurrent}
          onChange={(event) => onChange({ maxConcurrent: Number(event.target.value) })}
        />
      </div>
      <div className="menu-row">
        <label className="menu-label">Max file size (MB)</label>
        <input
          className="menu-input"
          type="number"
          min={5}
          max={500}
          value={value.maxFileSizeMb}
          onChange={(event) => onChange({ maxFileSizeMb: Number(event.target.value) })}
        />
      </div>
      <div className="menu-row">
        <label className="menu-label">Tracker URLs</label>
        <textarea
          className="menu-textarea"
          rows={3}
          value={value.trackers.join('\n')}
          onChange={(event) => onChange({ trackers: event.target.value.split(/\n|,/).map((t) => t.trim()).filter(Boolean) })}
        />
      </div>
      <button className={`menu-button ${saved ? 'menu-button--saved' : ''}`} onClick={onSave}>
        <Save size={14} /> Save BitTorrent
      </button>
    </MenuSection>
  );
}
