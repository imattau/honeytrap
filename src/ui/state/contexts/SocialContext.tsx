import React, { createContext, useContext, useMemo, useCallback } from 'react';
import { useSocialState } from '../useSocialState';
import { useSettings } from './SettingsContext';
import { useAuth } from './AuthContext';
import { useNostr } from './NostrContext';
import { SocialGraph } from '../../../nostr/social';
import type { ProfileMetadata } from '../../../nostr/types';
import type { AppSettings } from '../../../storage/types';

interface SocialContextValue {
  followers: string[];
  isFollowed: (pubkey: string) => boolean;
  isBlocked: (pubkey: string) => boolean;
  isNsfwAuthor: (pubkey: string) => boolean;
  toggleFollow: (pubkey: string) => void;
  toggleBlock: (pubkey: string) => void;
  toggleNsfwAuthor: (pubkey: string) => void;
  fetchFollowersFor: (pubkey: string) => Promise<string[]>;
  fetchFollowingFor: (pubkey: string) => Promise<string[]>;
  searchProfiles: (query: string) => Promise<Record<string, ProfileMetadata>>;
}

const SocialContext = createContext<SocialContextValue | undefined>(undefined);

export function SocialProvider({ children }: { children: React.ReactNode }) {
  const { settings, updateSettings } = useSettings();
  const { keys } = useAuth();
  const { nostr } = useNostr();

  const { followers } = useSocialState({
    nostr,
    keysNpub: keys?.npub,
    settings,
    updateSettings
  });

  const isFollowed = useCallback((pubkey: string) => {
    return settings.follows.includes(pubkey);
  }, [settings.follows]);

  const isBlocked = useCallback((pubkey: string) => {
    return settings.blocked.includes(pubkey);
  }, [settings.blocked]);

  const isNsfwAuthor = useCallback((pubkey: string) => {
    return settings.nsfwAuthors.includes(pubkey);
  }, [settings.nsfwAuthors]);

  const toggleFollow = useCallback((pubkey: string) => {
    updateSettings((prev: AppSettings) => {
      const graph = new SocialGraph(prev);
      return { ...graph.toggleFollow(pubkey), followsUpdatedAt: Date.now() };
    });
  }, [updateSettings]);

  const toggleBlock = useCallback((pubkey: string) => {
    updateSettings((prev: AppSettings) => {
      const graph = new SocialGraph(prev);
      return { ...graph.toggleBlock(pubkey), followsUpdatedAt: Date.now() };
    });
  }, [updateSettings]);

  const toggleNsfwAuthor = useCallback((pubkey: string) => {
    updateSettings((prev: AppSettings) => {
      const graph = new SocialGraph(prev);
      return graph.toggleNsfw(pubkey);
    });
  }, [updateSettings]);

  const fetchFollowersFor = useCallback(async (pubkey: string) => {
    return nostr.fetchFollowers(pubkey, 600);
  }, [nostr]);

  const fetchFollowingFor = useCallback(async (pubkey: string) => {
    return nostr.fetchFollowing(pubkey);
  }, [nostr]);

  const searchProfiles = useCallback(async (query: string) => {
    return nostr.searchProfiles(query);
  }, [nostr]);

  const value = useMemo(() => ({
    followers,
    isFollowed,
    isBlocked,
    isNsfwAuthor,
    toggleFollow,
    toggleBlock,
    toggleNsfwAuthor,
    fetchFollowersFor,
    fetchFollowingFor,
    searchProfiles
  }), [followers, isFollowed, isBlocked, isNsfwAuthor, toggleFollow, toggleBlock, toggleNsfwAuthor, fetchFollowersFor, fetchFollowingFor, searchProfiles]);

  return (
    <SocialContext.Provider value={value}>
      {children}
    </SocialContext.Provider>
  );
}

export function useSocial() {
  const context = useContext(SocialContext);
  if (!context) throw new Error('useSocial must be used within a SocialProvider');
  return context;
}
