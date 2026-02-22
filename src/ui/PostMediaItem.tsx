import React, { useEffect, useState } from 'react';
import { isVideoUrl } from './utils';
import type { MediaSource } from '../nostr/media';

interface PostMediaItemProps {
  item: MediaSource;
  eventId: string;
  authorPubkey: string;
  loadMedia: (input: {
    eventId: string;
    source: { url: string; magnet?: string; sha256?: string; type: 'media' };
    authorPubkey: string;
    timeoutMs?: number;
  }) => Promise<{ url: string; source: 'p2p' | 'http' }>;
  onActivate?: () => void;
}

export const PostMediaItem: React.FC<PostMediaItemProps> = ({
  item,
  eventId,
  authorPubkey,
  loadMedia,
  onActivate
}) => {
  const isVideo = isVideoUrl(item.url);
  const [src, setSrc] = useState(item.url);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    loadMedia({
      eventId,
      authorPubkey,
      source: { url: item.url, magnet: item.magnet, sha256: item.sha256, type: 'media' },
      timeoutMs: isVideo ? 4000 : 800
    })
      .then((result) => {
        if (!active) return;
        if (result.url !== item.url) setSrc(result.url);
      })
      .catch(() => null);
    return () => {
      active = false;
    };
  }, [authorPubkey, eventId, isVideo, item.magnet, item.sha256, item.url, loadMedia]);

  return (
    <button
      type="button"
      className={`post-media-shell ${loaded ? 'loaded' : ''} ${isVideo ? 'video' : 'image'}`}
      onClick={(eventArg) => {
        eventArg.stopPropagation();
        onActivate?.();
      }}
    >
      {isVideo ? (
        <video
          src={src}
          controls
          className="post-media-item"
          onLoadedData={() => setLoaded(true)}
        />
      ) : (
        <img
          src={src}
          alt="media"
          className="post-media-item"
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
        />
      )}
    </button>
  );
};
