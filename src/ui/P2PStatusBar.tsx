import { useMemo } from 'react';
import type { TorrentSnapshot } from '../p2p/registry';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

export function P2PStatusBar({ torrents, enabled }: { torrents: TorrentSnapshot; enabled: boolean }) {
  const stats = useMemo(() => {
    const all = Object.values(torrents);
    const active = all.filter((t) => t.active);
    const peers = all.reduce((sum, t) => sum + t.peers, 0);
    const downloaded = active.reduce((sum, t) => sum + t.downloaded, 0);
    const uploaded = active.reduce((sum, t) => sum + t.uploaded, 0);
    const fetching = active.filter((t) => t.mode === 'fetch').length;
    const seeding = active.filter((t) => t.mode === 'seed').length;
    return { active: active.length, peers, downloaded, uploaded, fetching, seeding };
  }, [torrents]);

  if (!enabled) return null;

  const isActive = stats.active > 0;
  const hasPeers = stats.peers > 0;

  return (
    <div className={`p2p-bar ${isActive ? 'p2p-bar--active' : hasPeers ? 'p2p-bar--idle' : 'p2p-bar--dormant'}`}>
      <span className="p2p-bar__nodes">
        <svg width="10" height="10" viewBox="0 0 10 10" className="p2p-bar__hex">
          <polygon points="5,0.5 9.33,2.75 9.33,7.25 5,9.5 0.67,7.25 0.67,2.75" fill="none" stroke="currentColor" strokeWidth="1" />
        </svg>
        {hasPeers ? stats.peers : '—'}
      </span>

      <span className="p2p-bar__divider" />

      {isActive ? (
        <>
          {stats.fetching > 0 && (
            <span className="p2p-bar__stat p2p-bar__stat--fetch">
              <span className="p2p-bar__arrow">↓</span>
              {stats.fetching} {stats.downloaded > 0 ? formatBytes(stats.downloaded) : ''}
            </span>
          )}
          {stats.seeding > 0 && (
            <span className="p2p-bar__stat p2p-bar__stat--seed">
              <span className="p2p-bar__arrow">↑</span>
              {stats.seeding} {stats.uploaded > 0 ? formatBytes(stats.uploaded) : ''}
            </span>
          )}
          <span className="p2p-bar__pulse" aria-hidden="true" />
        </>
      ) : (
        <span className="p2p-bar__label">{hasPeers ? 'ready' : 'searching'}</span>
      )}
    </div>
  );
}
