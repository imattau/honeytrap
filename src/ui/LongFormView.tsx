import React, { useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import type { NostrEvent } from '../nostr/types';
import { parseLongFormTags } from '../nostr/utils';
import { useAppState } from './AppState';
import { PageHeader } from './PageHeader';
import { MarkdownRenderer } from './MarkdownRenderer';

export function LongFormView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { findEventById, fetchEventById, profiles } = useAppState();
  const [event, setEvent] = useState<NostrEvent | undefined>(() => (id ? findEventById(id) : undefined));
  const [loading, setLoading] = useState(() => !event);

  useEffect(() => {
    if (!id) {
      setEvent(undefined);
      setLoading(false);
      return;
    }
    const local = findEventById(id);
    if (local) {
      setEvent(local);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchEventById(id)
      .then((loaded) => setEvent(loaded))
      .catch(() => setEvent(undefined))
      .finally(() => setLoading(false));
  }, [fetchEventById, findEventById, id]);

  const longForm = useMemo(() => (event ? parseLongFormTags(event.tags) : undefined), [event]);
  const authorProfile = event ? profiles[event.pubkey] : undefined;

  if (!event && !loading) {
    return <div className="thread-empty">Article unavailable.</div>;
  }

  return (
    <div className="longform-view">
      <div className={`progress-line ${loading ? 'active' : ''}`} aria-hidden="true" />
      <div className="longform-shell">
        <PageHeader title="" showBack className="longform-header-back" />
        {event && (
          <article className="longform-card">
            {longForm?.image && <img className="longform-hero" src={longForm.image} alt="Article" />}
            <h1 className="longform-title">{longForm?.title ?? 'Untitled article'}</h1>
            <div className="longform-meta">
              <button
                type="button"
                className="longform-author"
                onClick={() => flushSync(() => navigate(`/author/${event.pubkey}`))}
              >
                {authorProfile?.display_name ?? authorProfile?.name ?? event.pubkey.slice(0, 16)}
              </button>
              <span>{new Date(event.created_at * 1000).toLocaleDateString()}</span>
            </div>
            {longForm?.summary && <p className="longform-summary">{longForm.summary}</p>}
            <MarkdownRenderer content={event.content} />
          </article>
        )}
      </div>
    </div>
  );
}
