# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start development server (Vite)
npm run build     # Production build (tsc + vite build)
npm run preview   # Preview production build locally
npm run lint      # Type checking via tsc --noEmit
npm run test      # Run tests via vitest
```

To run a single test file:
```bash
npx vitest run src/path/to/file.test.ts
```

## Architecture

Honeytrap is a Nostr PWA (React 18 + TypeScript + Vite) with four distinct layers:

### 1. Nostr Layer (`src/nostr/`)
- **`client.ts`** — `NostrClient`: relay pool management via `nostr-tools/pool`, query batching
- **`feed.ts`** — `FeedOrchestrator`: feed subscription lifecycle, event deduplication, profile hydration, pending event batching
- **`workerFeedService.ts`** — `WorkerFeedService`: runs `FeedOrchestrator` in a Web Worker (`nostr/worker/`) with 40ms batch flush and exponential backoff; falls back to main thread if Worker unavailable
- **`thread.ts`** — `ThreadService`: resolves root-to-reply stacks with caching
- **`social.ts`** — `SocialGraph`: follow/block/NSFW author tracking
- **`cache.ts`** — `NostrCache`: in-memory + IndexedDB profile/event caching
- Other services: `author.ts`, `hashtag.ts`, `lists.ts` (NIP-65), `nwc.ts` (zaps/NIP-57), `publish.ts`, `mediaUpload.ts` (Blossom)

### 2. P2P Layer (`src/p2p/`)
- **`webtorrentHub.ts`** — `WebTorrentHub`: WebTorrent client lifecycle
- **`mediaAssist.ts`** — `MediaAssist`: retrieves media via magnet URIs; HTTP fallback
- **`eventAssist.ts`** — `EventAssist`: retrieves event packages when posts have `['bt', magnet, 'event']` tags
- SHA-256 verification runs in `hash.worker.ts`; `canonical.ts` serializes events for verification

### 3. Storage Layer (`src/storage/`)
- **`db.ts`** — IndexedDB schema (idb library); events, cache, settings, keys
- **`settings.ts`** — Settings persistence with defaults from `defaults.ts`
- `localStorage` for auth settings (NIP-46 recovery codes); `sessionStorage` for feed scroll position

### 4. UI Layer (`src/ui/`)
- **`AppState.tsx`** — Central `AppStateProvider` context; instantiates all services and exposes state to React
- **`state/`** — Custom hooks by domain: `useAuthState`, `useFeedState`, `useSettingsState`, `useRelayState`, `useSocialState`, `useP2PState`, `useTransportState`
- **`App.tsx`** — Routing (React Router 7); route changes pause/resume feed subscriptions
- Feed rendered with `react-virtuoso` (virtualized scrolling for 300+ events)

### Data Flow
Route active → `WorkerFeedService` runs `FeedOrchestrator` in Worker → `NostrClient` fetches from relay pool → events batched (40ms) and flushed → `NostrCache` + IndexedDB → `AppStateProvider` state → React components.

Route inactive → feed subscriptions paused to avoid blocking renders.

## Key Decisions & Constraints
- Feed fetching runs in a Web Worker; the main thread only processes batched results
- P2P assist (WebTorrent) is opportunistic — never the source of truth for events
- `src/wasm/` is a placeholder; no WASM binary is bundled yet
- Reposts/likes/shares exist in UI only (not wired to protocol)
- No DM support
