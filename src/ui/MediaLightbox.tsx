import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Minus, Plus, X } from 'lucide-react';
import { isVideoUrl } from './utils';
import type { MediaSource } from '../nostr/media';

interface MediaLightboxProps {
  items: MediaSource[];
  startIndex: number;
  eventId: string;
  authorPubkey: string;
  loadMedia: (input: {
    eventId: string;
    source: { url: string; magnet?: string; sha256?: string; type: 'media' };
    authorPubkey: string;
    timeoutMs?: number;
  }) => Promise<{ url: string; source: 'p2p' | 'http' }>;
  onClose: () => void;
}

export const MediaLightbox: React.FC<MediaLightboxProps> = ({
  items,
  startIndex,
  eventId,
  authorPubkey,
  loadMedia,
  onClose
}) => {
  const [index, setIndex] = useState(startIndex);
  const [zoom, setZoom] = useState(1);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const current = items[index] ?? items[0];

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') setIndex((prev) => (prev + 1) % items.length);
      if (event.key === 'ArrowLeft') setIndex((prev) => (prev - 1 + items.length) % items.length);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [items.length, onClose]);

  useEffect(() => {
    setZoom(1);
  }, [index]);

  if (!current) return null;

  return (
    <div className="media-lightbox" onClick={onClose}>
      <button
        className="media-lightbox-close"
        onClick={(eventArg) => {
          eventArg.stopPropagation();
          onClose();
        }}
        aria-label="Close media viewer"
      >
        <X size={18} />
      </button>
      {items.length > 1 && (
        <>
          <button
            className="media-lightbox-nav prev"
            onClick={(eventArg) => {
              eventArg.stopPropagation();
              setIndex((prev) => (prev - 1 + items.length) % items.length);
            }}
            aria-label="Previous media"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            className="media-lightbox-nav next"
            onClick={(eventArg) => {
              eventArg.stopPropagation();
              setIndex((prev) => (prev + 1) % items.length);
            }}
            aria-label="Next media"
          >
            <ChevronRight size={20} />
          </button>
        </>
      )}
      <div
        className="media-lightbox-stage"
        onClick={(eventArg) => eventArg.stopPropagation()}
        onTouchStart={(eventArg) => setTouchStartX(eventArg.touches[0]?.clientX ?? null)}
        onTouchEnd={(eventArg) => {
          const endX = eventArg.changedTouches[0]?.clientX;
          if (touchStartX === null || typeof endX !== 'number') return;
          const delta = endX - touchStartX;
          if (Math.abs(delta) < 40 || items.length <= 1) return;
          if (delta > 0) setIndex((prev) => (prev - 1 + items.length) % items.length);
          else setIndex((prev) => (prev + 1) % items.length);
          setTouchStartX(null);
        }}
      >
        <ResolvedLightboxMedia
          item={current}
          eventId={eventId}
          authorPubkey={authorPubkey}
          loadMedia={loadMedia}
          zoom={zoom}
          onZoomToggle={() => setZoom((prev) => (prev >= 2 ? 1 : 2))}
        />
      </div>
      {!isVideoUrl(current.url) && (
        <div className="media-lightbox-zoom" onClick={(eventArg) => eventArg.stopPropagation()}>
          <button
            className="media-lightbox-tool"
            onClick={() => setZoom((prev) => Math.max(1, Number((prev - 0.25).toFixed(2))))}
            aria-label="Zoom out"
          >
            <Minus size={16} />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            className="media-lightbox-tool"
            onClick={() => setZoom((prev) => Math.min(3, Number((prev + 0.25).toFixed(2))))}
            aria-label="Zoom in"
          >
            <Plus size={16} />
          </button>
        </div>
      )}
      <div className="media-lightbox-count">{index + 1} / {items.length}</div>
    </div>
  );
};

function ResolvedLightboxMedia({
  item,
  eventId,
  authorPubkey,
  loadMedia,
  zoom,
  onZoomToggle
}: {
  item: MediaSource;
  eventId: string;
  authorPubkey: string;
  loadMedia: (input: {
    eventId: string;
    source: { url: string; magnet?: string; sha256?: string; type: 'media' };
    authorPubkey: string;
    timeoutMs?: number;
  }) => Promise<{ url: string; source: 'p2p' | 'http' }>;
  zoom: number;
  onZoomToggle: () => void;
}) {
  const isVideo = isVideoUrl(item.url);
  const [src, setSrc] = useState(item.url);

  useEffect(() => {
    let active = true;
    loadMedia({
      eventId,
      authorPubkey,
      source: { url: item.url, magnet: item.magnet, sha256: item.sha256, type: 'media' },
      timeoutMs: isVideo ? 5000 : 1200
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

  if (isVideo) {
    return <video className="media-lightbox-item" src={src} controls autoPlay />;
  }

  return (
    <img
      className="media-lightbox-item"
      src={src}
      alt="media"
      style={{ transform: `scale(${zoom})` }}
      onDoubleClick={() => onZoomToggle()}
    />
  );
}
