import React, { useEffect, useRef, useState } from 'react';
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
  // Track loaded state per src so switching src doesn't reset the shimmer
  // back to unloaded for a URL the browser already has decoded.
  const loadedSrcs = useRef<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(() => loadedSrcs.current.has(item.url));

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
        if (result.url !== item.url) {
          // Only swap src if the resolved URL differs (P2P blob URL).
          // Preserve loaded state if the new src was already decoded.
          setSrc(result.url);
          if (loadedSrcs.current.has(result.url)) {
            setLoaded(true);
          }
        }
      })
      .catch(() => null);
    return () => {
      active = false;
    };
  }, [authorPubkey, eventId, isVideo, item.magnet, item.sha256, item.url, loadMedia]);

  const handleLoaded = () => {
    loadedSrcs.current.add(src);
    setLoaded(true);
  };

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
          onLoadedData={handleLoaded}
        />
      ) : (
        <img
          src={src}
          alt="media"
          className="post-media-item"
          loading="lazy"
          decoding="async"
          onLoad={handleLoaded}
        />
      )}
    </button>
  );
};
