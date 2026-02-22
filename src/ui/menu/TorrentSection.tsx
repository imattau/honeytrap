import React, { useMemo } from 'react';
import { Bolt, Globe2, Save } from 'lucide-react';
import type { P2PSettings } from '../../storage/types';
import { MenuSection } from './MenuSection';
import { useAppState } from '../AppState';

interface TorrentSectionProps {
  value: P2PSettings;
  onChange: (patch: Partial<P2PSettings>) => void;
  onSave: () => void;
  saved?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

export function TorrentSection({ value, onChange, onSave, saved }: TorrentSectionProps) {
  const { torrents, canEncryptNip44, reseedTorrent } = useAppState();
  const [showAll, setShowAll] = React.useState(false);
  const [reseeding, setReseeding] = React.useState<Record<string, boolean>>({});
  const reseedDisabled = !value.enabled;
  const { activeTorrents, inactiveTorrents } = useMemo(() => {
    const items = Object.values(torrents).sort((a, b) => b.updatedAt - a.updatedAt);
    return {
      activeTorrents: items.filter((item) => item.active).slice(0, 6),
      inactiveTorrents: items.filter((item) => !item.active).slice(0, 40)
    };
  }, [torrents]);

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
      <div className="menu-toggle-row">
        <label className="menu-toggle">
          <input
            type="checkbox"
            checked={value.publishSeedingList}
            onChange={(event) => onChange({ publishSeedingList: event.target.checked })}
          />
          <span>Publish public seeding index</span>
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
      <div className="menu-row">
        <label className="menu-label">ICE / STUN servers</label>
        <textarea
          className="menu-textarea"
          rows={3}
          value={(value.iceServers ?? []).join('\n')}
          onChange={(event) => onChange({ iceServers: event.target.value.split(/\n|,/).map((s) => s.trim()).filter(Boolean) })}
        />
      </div>
      {!canEncryptNip44 && (
        <div className="menu-sub">
          Encrypted torrent list is best-effort. Remote signer support is planned.
        </div>
      )}
      <div className="menu-sub">
        Public seeding index helps other Honeytrap clients discover magnet links when posts omit them.
      </div>
      {(activeTorrents.length > 0 || inactiveTorrents.length > 0) && (
        <div className="torrent-list">
          <div className="menu-row">
            <span className="menu-label">Torrents</span>
            <button className="menu-pill" onClick={() => setShowAll((prev) => !prev)}>
              {showAll ? 'Hide history' : 'Show history'}
            </button>
          </div>
          <div className="torrent-list-items">
            {activeTorrents.map((item) => (
              <div className="torrent-item" key={item.magnet}>
                <div className="torrent-item-row">
                  <span className={`torrent-chip ${item.mode}`}>{item.mode}</span>
                  <span className="torrent-name">{item.name ?? item.url ?? 'torrent'}</span>
                </div>
                <div className="torrent-meta">
                  <span>{Math.round(item.progress * 100)}%</span>
                  <span>{item.peers} peers</span>
                  {item.downloaded > 0 && <span>↓ {formatBytes(item.downloaded)}</span>}
                  {item.uploaded > 0 && <span>↑ {formatBytes(item.uploaded)}</span>}
                </div>
              </div>
            ))}
            {showAll && inactiveTorrents.map((item) => (
              <div className="torrent-item inactive" key={item.magnet}>
                <div className="torrent-item-row">
                  <span className={`torrent-chip ${item.mode}`}>{item.mode}</span>
                  <span className="torrent-name">{item.name ?? item.url ?? 'torrent'}</span>
                </div>
                <div className="torrent-meta">
                  <span>{Math.round(item.progress * 100)}%</span>
                  <span>{item.peers} peers</span>
                  {item.downloaded > 0 && <span>↓ {formatBytes(item.downloaded)}</span>}
                  {item.uploaded > 0 && <span>↑ {formatBytes(item.uploaded)}</span>}
                  <button
                    className={`torrent-reseed ${reseeding[item.magnet] ? 'active' : ''}`}
                    disabled={reseedDisabled}
                    onClick={() => {
                      setReseeding((prev) => ({ ...prev, [item.magnet]: true }));
                      try {
                        reseedTorrent(item.magnet);
                      } finally {
                        window.setTimeout(() => {
                          setReseeding((prev) => ({ ...prev, [item.magnet]: false }));
                        }, 1200);
                      }
                    }}
                  >
                    {reseedDisabled ? 'Enable P2P' : reseeding[item.magnet] ? 'Reseeding…' : 'Reseed'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <button className={`menu-button ${saved ? 'menu-button--saved' : ''}`} onClick={onSave}>
        <Save size={14} /> Save BitTorrent
      </button>
    </MenuSection>
  );
}
