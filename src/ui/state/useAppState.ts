import { useSettings } from './contexts/SettingsContext';
import { useAuth } from './contexts/AuthContext';
import { useRelay } from './contexts/RelayContext';
import { useTransport } from './contexts/TransportContext';
import { useSocial } from './contexts/SocialContext';
import { useP2P } from './contexts/P2PContext';
import { useFeed } from './contexts/FeedContext';

/**
 * Compatibility hook that aggregates all contexts into the original AppState interface.
 * This ensures that existing components continue to work while we transition to
 * individual context hooks.
 */
export function useAppState() {
  const settingsCtx = useSettings();
  const authCtx = useAuth();
  const relayCtx = useRelay();
  const transportCtx = useTransport();
  const socialCtx = useSocial();
  const p2pCtx = useP2P();
  const feedCtx = useFeed();

  return {
    // Settings
    settings: settingsCtx.settings,
    setSettings: settingsCtx.updateSettings,
    setFeedMode: settingsCtx.setFeedMode,

    // Auth
    keys: authCtx.keys,
    signer: authCtx.signer,
    nip44Cipher: authCtx.nip44Cipher,
    saveKeyRecord: authCtx.saveKeyRecord,
    clearKeys: authCtx.clearKeys,
    connectNip07: authCtx.connectNip07,
    connectNip46: authCtx.connectNip46,
    disconnectNip46: authCtx.disconnectNip46,
    isAuthed: authCtx.isAuthed,

    // Relay
    relayList: relayCtx.relayList,
    mediaRelayList: relayCtx.mediaRelayList,
    relayStatus: relayCtx.relayStatus,
    refreshRelayStatus: relayCtx.refreshRelayStatus,
    publishRelayList: relayCtx.publishRelayList,
    saveMediaRelays: relayCtx.saveMediaRelays,

    // Transport
    transportStore: transportCtx.transportStore,

    // Social
    followers: socialCtx.followers,
    following: settingsCtx.settings.follows,
    isFollowed: socialCtx.isFollowed,
    isBlocked: socialCtx.isBlocked,
    isNsfwAuthor: socialCtx.isNsfwAuthor,
    toggleFollow: socialCtx.toggleFollow,
    toggleBlock: socialCtx.toggleBlock,
    toggleNsfwAuthor: socialCtx.toggleNsfwAuthor,
    fetchFollowersFor: socialCtx.fetchFollowersFor,
    fetchFollowingFor: socialCtx.fetchFollowingFor,
    searchProfiles: socialCtx.searchProfiles,

    // P2P
    torrents: p2pCtx.torrents,
    canEncryptNip44: p2pCtx.canEncryptNip44,
    loadMedia: p2pCtx.loadMedia,
    seedMediaFile: p2pCtx.seedMediaFile,
    seedEvent: p2pCtx.seedEvent,
    reseedTorrent: p2pCtx.reseedTorrent,
    assistEvent: p2pCtx.assistEvent,
    attachMedia: p2pCtx.attachMedia,
    uploadMedia: p2pCtx.uploadMedia,
    saveP2PSettings: async (p2pSettings: any, updatedAt: number) => {
      settingsCtx.updateSettings({
        ...settingsCtx.settings,
        p2p: p2pSettings,
        p2pUpdatedAt: updatedAt
      });
    },

    // Feed
    events: feedCtx.events,
    profiles: feedCtx.profiles,
    feedLoading: feedCtx.feedLoading,
    pendingCount: feedCtx.pendingCount,
    selectedEvent: feedCtx.selectedEvent,
    selectedAuthor: feedCtx.selectedAuthor,
    selfProfile: feedCtx.selfProfile,
    paused: feedCtx.paused,
    setPaused: feedCtx.setPaused,
    selectEvent: feedCtx.selectEvent,
    selectAuthor: feedCtx.selectAuthor,
    loadOlder: feedCtx.loadOlder,
    flushPending: feedCtx.flushPending,
    loadThread: feedCtx.loadThread,
    publishPost: feedCtx.publishPost,
    publishReply: feedCtx.publishReply,
    sendZap: feedCtx.sendZap,
    publishRepost: feedCtx.publishRepost,
    publishReaction: feedCtx.publishReaction,
    shareEvent: feedCtx.shareEvent,
    publishProfile: feedCtx.publishProfile,
    searchEvents: feedCtx.searchEvents,
    fetchMentions: feedCtx.fetchMentions,
    subscribeMentions: feedCtx.subscribeMentions,
    fetchLists: feedCtx.fetchLists,
    publishPeopleList: feedCtx.publishPeopleList,
    mergeProfiles: feedCtx.mergeProfiles,
    hydrateProfiles: feedCtx.hydrateProfiles,
    authorService: feedCtx.authorService,
    hashtagService: feedCtx.hashtagService,
    findEventById: feedCtx.findEventById,
    fetchEventById: feedCtx.fetchEventById
  };
}
