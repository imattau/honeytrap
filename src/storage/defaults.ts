import type { AppSettings } from './types';

export const defaultSettings: AppSettings = {
  relays: [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.snort.social'
  ],
  follows: [],
  blocked: [],
  nsfwAuthors: [],
  feedMode: 'all',
  mediaRelays: [
    'https://blossom.primal.net',
    'https://blossom.nostr.build',
    'https://blosstr.com'
  ],
  wallet: {
    lnurl: '',
    presets: [100, 500, 1000],
    nwc: ''
  },
  p2p: {
    enabled: true,
    scope: 'follows',
    preferMedia: true,
    preferEvents: false,
    maxConcurrent: 5,
    maxFileSizeMb: 50,
    seedWhileOpen: true,
    trackers: [
      'wss://tracker.openwebtorrent.com',
      'wss://tracker.btorrent.xyz'
    ]
  },
  p2pUpdatedAt: 0
};
