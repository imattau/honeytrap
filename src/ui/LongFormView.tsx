import React, { useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import type { NostrEvent } from '../nostr/types';
import { parseLongFormTags } from '../nostr/utils';
import { useAppState } from './AppState';

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
        <button className="author-back" onClick={() => {
          const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
          if (idx > 0) flushSync(() => navigate(-1));
          else flushSync(() => navigate('/'));
        }} aria-label="Back">
          <ArrowLeft size={18} />
        </button>
        {event && (
          <article className="longform-card">
            {longForm?.image && <img className="longform-hero" src={longForm.image} alt="Article" />}
            <h1 className="longform-title">{longForm?.title ?? 'Untitled article'}</h1>
            <div className="longform-meta">
              <button className="longform-author" onClick={() => flushSync(() => navigate(`/author/${event.pubkey}`))}>
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

function MarkdownRenderer({ content }: { content: string }) {
  const blocks = useMemo(() => parseMarkdownBlocks(content), [content]);
  return <div className="longform-markdown">{blocks}</div>;
}

function parseMarkdownBlocks(content: string): React.ReactNode[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const out: React.ReactNode[] = [];
  let paragraph: string[] = [];
  let codeFence: string[] | null = null;
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const text = paragraph.join(' ').trim();
    if (text) out.push(<p key={`p-${out.length}`}>{renderInlineMarkdown(text)}</p>);
    paragraph = [];
  };

  const flushList = () => {
    if (listItems.length === 0) return;
    out.push(
      <ul key={`ul-${out.length}`}>
        {listItems.map((item, idx) => <li key={`li-${idx}`}>{renderInlineMarkdown(item)}</li>)}
      </ul>
    );
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (line.startsWith('```')) {
      flushParagraph();
      flushList();
      if (codeFence) {
        out.push(
          <pre key={`code-${out.length}`}>
            <code>{codeFence.join('\n')}</code>
          </pre>
        );
        codeFence = null;
      } else {
        codeFence = [];
      }
      continue;
    }

    if (codeFence) {
      codeFence.push(rawLine);
      continue;
    }

    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      const text = heading[2].trim();
      out.push(renderHeading(Math.min(level, 6), text, `h-${out.length}`));
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      flushParagraph();
      listItems.push(line.replace(/^[-*]\s+/, '').trim());
      continue;
    }

    if (line.startsWith('>')) {
      flushParagraph();
      flushList();
      out.push(<blockquote key={`q-${out.length}`}>{renderInlineMarkdown(line.replace(/^>\s?/, ''))}</blockquote>);
      continue;
    }

    if (/^---+$/.test(line)) {
      flushParagraph();
      flushList();
      out.push(<hr key={`hr-${out.length}`} />);
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  flushList();

  return out;
}

function renderHeading(level: number, text: string, key: string) {
  if (level === 1) return <h1 key={key}>{renderInlineMarkdown(text)}</h1>;
  if (level === 2) return <h2 key={key}>{renderInlineMarkdown(text)}</h2>;
  if (level === 3) return <h3 key={key}>{renderInlineMarkdown(text)}</h3>;
  if (level === 4) return <h4 key={key}>{renderInlineMarkdown(text)}</h4>;
  if (level === 5) return <h5 key={key}>{renderInlineMarkdown(text)}</h5>;
  return <h6 key={key}>{renderInlineMarkdown(text)}</h6>;
}

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^\)]+\))/g);
  return tokens.map((token, idx) => {
    if (!token) return null;
    if (/^`[^`]+`$/.test(token)) return <code key={`code-${idx}`}>{token.slice(1, -1)}</code>;
    if (/^\*\*[^*]+\*\*$/.test(token)) return <strong key={`strong-${idx}`}>{token.slice(2, -2)}</strong>;
    const link = token.match(/^\[([^\]]+)\]\(([^\)]+)\)$/);
    if (link) {
      const [, label, href] = link;
      return <a key={`link-${idx}`} href={href} target="_blank" rel="noreferrer">{label}</a>;
    }
    return <React.Fragment key={`txt-${idx}`}>{token}</React.Fragment>;
  });
}
