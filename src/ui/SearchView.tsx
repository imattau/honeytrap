import React, { useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Search, UserCircle, FileText } from 'lucide-react';
import type { NostrEvent, ProfileMetadata } from '../nostr/types';
import { decodeKey } from '../nostr/auth';
import { decodeNostrUri } from '../nostr/uri';
import { useAppState } from './AppState';
import { PageHeader } from './PageHeader';

export function SearchView() {
  const navigate = useNavigate();
  const { searchProfiles, searchEvents, fetchEventById } = useAppState();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [profileResults, setProfileResults] = useState<Record<string, ProfileMetadata>>({});
  const [eventResults, setEventResults] = useState<NostrEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const profileEntries = useMemo(() => Object.entries(profileResults), [profileResults]);

  const runSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setError(null);

    const direct = await resolveDirectTarget(trimmed, fetchEventById);
    if (direct?.type === 'author') {
      flushSync(() => navigate(`/author/${direct.pubkey}`));
      return;
    }
    if (direct?.type === 'event') {
      flushSync(() => navigate(`/thread/${direct.id}`));
      return;
    }

    setLoading(true);
    try {
      const [profiles, events] = await Promise.all([
        searchProfiles(trimmed),
        searchEvents(trimmed)
      ]);
      setProfileResults(profiles);
      setEventResults(events);
      if (Object.keys(profiles).length === 0 && events.length === 0) {
        setError('No results found on connected relays.');
      }
    } catch {
      setError('Search failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="search-view">
      <PageHeader
        title="Search"
        subtitle="Find users by name/npub and events by note/nevent/content."
        className="search-header"
      />
      
      <div className="search-form">
        <label htmlFor="search-input" className="search-label">Query</label>
        <div className="search-row">
          <input
            id="search-input"
            className="search-input"
            placeholder="npub1..., note1..., nevent1..., or keyword"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') runSearch().catch(() => null);
            }}
          />
          <button
            type="button"
            className="search-button"
            onClick={() => runSearch().catch(() => null)}
            disabled={loading || !query.trim()}
          >
            <Search size={16} /> {loading ? 'Searching…' : 'Search'}
          </button>
        </div>
      </div>
      {error && <div className="search-error">{error}</div>}

      {profileEntries.length > 0 && (
        <section className="search-results">
          <div className="search-section-title">Profiles</div>
          {profileEntries.map(([pubkey, profile]) => (
            <button
              key={pubkey}
              type="button"
              className="search-result"
              onClick={() => flushSync(() => navigate(`/author/${pubkey}`))}
            >
              <UserCircle size={16} />
              <div>
                <div className="search-result-title">{profile.display_name ?? profile.name ?? pubkey.slice(0, 16)}</div>
                <div className="search-result-sub">{pubkey}</div>
              </div>
            </button>
          ))}
        </section>
      )}

      {eventResults.length > 0 && (
        <section className="search-results">
          <div className="search-section-title">Events</div>
          {eventResults.map((event) => (
            <button
              key={event.id}
              type="button"
              className="search-result"
              onClick={() => {
                if (event.kind === 30023) {
                  flushSync(() => navigate(`/article/${event.id}`));
                  return;
                }
                flushSync(() => navigate(`/thread/${event.id}`));
              }}
            >
              <FileText size={16} />
              <div>
                <div className="search-result-title">{event.content.slice(0, 120) || '(no content)'}</div>
                <div className="search-result-sub">{event.id.slice(0, 22)}…</div>
              </div>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}

async function resolveDirectTarget(
  value: string,
  fetchEventById: (id: string) => Promise<NostrEvent | undefined>
): Promise<{ type: 'author'; pubkey: string } | { type: 'event'; id: string } | null> {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const nostrValue = trimmed.startsWith('nostr:') ? trimmed : `nostr:${trimmed}`;
  const decoded = decodeNostrUri(nostrValue);
  if (decoded?.type === 'npub' || decoded?.type === 'nprofile') {
    return { type: 'author', pubkey: decoded.pubkey };
  }
  if (decoded?.type === 'nevent' || decoded?.type === 'note') {
    return { type: 'event', id: decoded.id };
  }

  if (trimmed.startsWith('npub')) {
    try {
      return { type: 'author', pubkey: decodeKey(trimmed).npub };
    } catch {
      // continue
    }
  }

  if (/^[a-f0-9]{64}$/i.test(trimmed)) {
    const event = await fetchEventById(trimmed);
    if (event) return { type: 'event', id: event.id };
    return { type: 'author', pubkey: trimmed.toLowerCase() };
  }

  return null;
}
