import React, { createContext, useContext, useMemo, useEffect, useCallback } from 'react';
import { useP2PState } from '../useP2PState';
import { useSettings } from './SettingsContext';
import { useAuth } from './AuthContext';
import { useNostr } from './NostrContext';
import { useTransport } from './TransportContext';
import type { TorrentSnapshot } from '../../../p2p/registry';
import type { AssistSource } from '../../../p2p/types';
import type { NostrEvent } from '../../../nostr/types';
import { MediaAttachService, type MediaAttachMode, type MediaAttachResult } from '../../../p2p/mediaAttach';
import { MediaUploadService } from '../../../nostr/mediaUpload';

interface P2PContextValue {
  torrents: TorrentSnapshot;
  canEncryptNip44: boolean;
  loadMedia: (input: {
    eventId: string;
    source: AssistSource;
    authorPubkey: string;
    timeoutMs?: number;
  }) => Promise<{ url: string; source: 'p2p' | 'http' }>;
  seedMediaFile: (file: File) => Promise<{ url: string; magnet: string; sha256: string }>;
  seedEvent: (event: NostrEvent) => Promise<{ bt: string; sha256?: string } | undefined>;
  reseedTorrent: (magnet: string) => void;
  assistEvent: (event: NostrEvent) => Promise<void>;
  attachMedia: (files: File[], mode: MediaAttachMode, options: { relays: string[]; preferredRelay?: string; onProgress?: (percent: number) => void }) => Promise<MediaAttachResult[]>;
  uploadMedia: (file: File, relays: string[], onProgress?: (percent: number) => void, preferredRelay?: string) => Promise<{ url: string; sha256?: string }>;
}

const P2PContext = createContext<P2PContextValue | undefined>(undefined);

export function P2PProvider({ children }: { children: React.ReactNode }) {
  const { settings, updateSettings } = useSettings();
  const { keys, signer, nip44Cipher } = useAuth();
  const { nostr } = useNostr();
  const { transportStore } = useTransport();

  const { torrentSnapshot, canEncryptNip44, magnetBuilder, loadMedia, seedMediaFile, seedEvent, reseedTorrent, assistEvent, loadP2PSettings, publishP2PSettings } = useP2PState({
    settings,
    nostr,
    signer,
    nip44Cipher,
    keysNpub: keys?.npub,
    transportStore
  });

  const mediaUploadService = useMemo(() => new MediaUploadService(signer), [signer]);
  const uploadMedia = useCallback(async (file: File, relays: string[], onProgress?: (percent: number) => void, preferredRelay?: string) => {
    if (!keys?.npub) throw new Error('Sign in to upload media');
    return mediaUploadService.uploadWithFallback(file, relays, onProgress, preferredRelay);
  }, [mediaUploadService, keys?.npub]);

  const mediaAttachService = useMemo(
    () => new MediaAttachService(uploadMedia, seedMediaFile),
    [uploadMedia, seedMediaFile]
  );

  const attachMedia = useCallback(async (files: File[], mode: MediaAttachMode, options: { relays: string[]; preferredRelay?: string; onProgress?: (percent: number) => void }) => {
    return mediaAttachService.attach(files, mode, options);
  }, [mediaAttachService]);

  useEffect(() => {
    if (!keys?.npub) return;
    let active = true;
    loadP2PSettings(keys.npub)
      .then((remote) => {
        if (!active || !remote) return;
        const currentUpdatedAt = settings.p2pUpdatedAt ?? 0;
        if ((remote.updatedAt ?? 0) <= currentUpdatedAt) return;
        updateSettings({ ...settings, p2p: remote.settings, p2pUpdatedAt: remote.updatedAt });
      })
      .catch(() => null);
    return () => {
      active = false;
    };
  }, [keys, loadP2PSettings, updateSettings]);

  const value = useMemo(() => ({
    torrents: torrentSnapshot,
    canEncryptNip44,
    loadMedia,
    seedMediaFile,
    seedEvent,
    reseedTorrent,
    assistEvent,
    attachMedia,
    uploadMedia
  }), [torrentSnapshot, canEncryptNip44, loadMedia, seedMediaFile, seedEvent, reseedTorrent, assistEvent, attachMedia, uploadMedia]);

  return (
    <P2PContext.Provider value={value}>
      {children}
    </P2PContext.Provider>
  );
}

export function useP2P() {
  const context = useContext(P2PContext);
  if (!context) throw new Error('useP2P must be used within a P2PProvider');
  return context;
}
