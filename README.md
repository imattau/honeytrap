# Honeytrap

Dual-axis React PWA Nostr client with optional WebTorrent assist.

## What this is
- **Horizontal axis = timeline**: each post is a full-width panel with scroll-snap.
- **Vertical axis = depth**: scroll down inside a panel to reveal replies, list context, zaps, and long-form continuation.
- **WebTorrent assist**: optional P2P fetch for media and event packages with HTTP fallback and sha256 verification.

## Run
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
npm run preview
```

## Dual-axis navigation contract
- Horizontal navigation is only active when the current panel is at `scrollTop = 0`.
- Once the panel has vertical depth, horizontal swipes/scrolls are disabled.
- A “Back to top” button appears once depth exceeds ~1 screen.

## Nostr support (v0)
- **Notes**: kind `1`
- **Long-form**: kind `30023` (title/summary/cover via tags)
- **Lists**: NIP-51 list events (kind `30000`+) with list-mode filtering
- **Zaps**: NIP-57 best-effort flow using LNURL pay
- **Media relays**: configurable Blossom servers for hosted media

## WebTorrent tags
Media assist:
- `['bt', '<magnet-uri>', 'media', 'url=<http-url>']`
- `['x', 'sha256:<hex>', 'url=<http-url>']`

Event packages:
- `['bt', '<magnet-uri>', 'event']`
- `['x', 'sha256:<hex>', 'event']`

## Canonical event bytes
`canonicaliseEvent(event)` produces deterministic UTF-8 bytes by:
- Sorting all object keys recursively
- Removing `undefined` values
- JSON stringifying with no whitespace

Used for sha256 verification of event packages.

## P2P policy
- Default scope: authors you follow or authors in the active list
- “Everyone” scope can be enabled in settings
- Seeding is optional and only while the app is open
- Relays remain canonical for event data

## Media relays
Media relay defaults include Blossom servers and can be edited in Settings:
- https://blossom.primal.net
- https://blossom.nostr.build
- https://blosstr.com

## Tracklist lists
Tracklists are NIP-51 lists with extra `track` tags:
```
['track', '<url>', 'magnet=<magnet>', 'sha256=<hex>']
```

## Privacy notes
- P2P uses WebRTC/WebTorrent; peers can see IP/connection metadata.
- Seed only for scoped authors unless you choose “Everyone”.
- Keys are stored in IndexedDB (local browser storage).

## Structure
- `src/nostr/` relay client, subscriptions, publishing, lists, long-form, zaps
- `src/p2p/` WebTorrent wrapper, canonicalization, verification
- `src/storage/` IndexedDB settings and cache
- `src/ui/` UI components and panels

## Known limitations
- No DMs
- Zaps are best-effort and depend on LNURL pay endpoints
- Event package assist is opportunistic; relays are still authoritative
