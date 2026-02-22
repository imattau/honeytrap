import React from 'react';
import type { LinkPreviewSource } from '../nostr/links';

interface LinkPreviewCardProps {
  item: LinkPreviewSource;
}

export const LinkPreviewCard: React.FC<LinkPreviewCardProps> = ({ item }) => {
  let host = item.url;
  let path = '';
  try {
    const parsed = new URL(item.url);
    host = parsed.hostname;
    path = parsed.pathname.length > 1 ? parsed.pathname : '';
  } catch {
    // keep url as-is
  }
  return (
    <a className="link-preview" href={item.url} target="_blank" rel="noreferrer">
      <div className="link-host">{host}</div>
      <div className="link-path">{path || item.url}</div>
    </a>
  );
};
