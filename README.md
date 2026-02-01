# Honeytrap

![Honeytrap](/public/assets/honeytrap_header_960.png)

A premium, dual‑axis Nostr PWA: vertical depth per post, horizontal‑style navigation concepts reimagined as a fast, virtualized feed, with optional WebTorrent assist for media/event redundancy.

## Highlights
- **Dual‑axis reading**: a single post is a deep scroll (replies/long‑form) while the feed remains snap‑smooth and virtualized.
- **Signal‑like UI**: high contrast cards, minimal chrome, icon‑forward controls.
- **PWA‑first**: installable, fast, offline‑tolerant caching.
- **Optional P2P assist**: WebTorrent for media/event packages with HTTP fallback and SHA‑256 verification.

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

## Core Navigation
- **Feed**: virtualized and manually updated (no auto‑scroll). Pull‑to‑refresh on touch.
- **Thread view**: dedicated route with root‑to‑reply stack, actions at top.
- **Author view**: profile + author‑only feed.

## Nostr Support (v0)
- **Notes**: kind `1`
- **Long‑form**: kind `30023`
- **Lists**: NIP‑51 lists + tracklists
- **Zaps**: NIP‑57 requests + NWC payment
- **Relay list**: reads NIP‑65 (kind `10002`) for logged‑in users

## Media + P2P Assist
- **Media tags**
  - `['bt', '<magnet-uri>', 'media', 'url=<http-url>']`
  - `['x', 'sha256:<hex>', 'url=<http-url>']`
- **Event packages**
  - `['bt', '<magnet-uri>', 'event']`
  - `['x', 'sha256:<hex>', 'event']`

### Canonical event bytes
`canonicaliseEvent(event)` outputs deterministic UTF‑8 bytes (stable key order, no whitespace) for SHA‑256 validation.

## Privacy & Safety
- **P2P is additive**: relays stay canonical.
- **Scope**: follows‑only by default; can be widened.
- **NSFW blurring**: tags or manual author override hide sensitive content.

## Settings
- Relays (NIP‑65 aware)
- Media relays (Blossom defaults)
- BitTorrent assist (scope, trackers, concurrency)
- Wallet (NWC + zap presets)
- Feed filter (Follows / Following / Both / All)

## Structure
- `src/nostr/` – Nostr protocol/services (OO)
- `src/p2p/` – WebTorrent + verification
- `src/storage/` – IndexedDB settings/cache
- `src/ui/` – components, routes, layout

## Known Limitations
- No DMs
- Zaps are best‑effort (dependent on LNURL/NWC endpoints)
- Event‑package assist is opportunistic
