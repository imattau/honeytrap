# Session State
execution_mode: unattended
auto_continue: true

## Objective
Fix all P2P seeding gaps in honeytrap so cached events and media are correctly seeded.

## Context
Honeytrap is a Nostr PWA (React 18 + TypeScript + Vite) in /home/mattthomson/workspace/honeytrap.
P2P layer is in src/p2p/. State hook is src/ui/state/useP2PState.ts.

## Gaps to Fix

### Gap 2 (Fix FIRST - most critical): Two-phase publish seeds draft not final event
File: src/ui/state/contexts/FeedContext.tsx, lines ~118-139
Problem: seedEvent(draft) seeds the draft event (no bt tags). Then a second signNote() creates
the published event with a different id/sig. Peers downloading the torrent get an event that
doesn't match the published event ID.
Fix: Seed the FINAL event (after second signing), not the draft. Change publishPost/publishReply to:
1. Sign draft (no P2P tags)
2. Seed draft to get magnet/sha256  
3. Sign final event WITH bt/x tags
4. Seed final event (replace the torrent with final event bytes)
5. Publish final event
OR simpler: don't use bt/x self-referential tags. Instead seed AFTER publishing the final event.
Since the sha256 in the x tag is of the seeded content, and peers verify: download torrent ->
verify sha256 -> the simplest correct approach is seed the final event AFTER publishing it:
- Remove the two-phase sign-then-seed-then-resign approach
- Instead: sign once (no bt tags initially), seed after signing but return the event with bt tags
  attached as a SECOND event publish? No, that's worse.
BEST FIX: Seed the final signed event (with bt tags) after it's fully constructed. The bt/x tags
can reference a magnet that was pre-computed from the DRAFT (same content, different id/sig).
Recipients download the torrent, get the draft, verifyEvent(draft) -> valid sig, verifySha256 -> matches.
The draft IS authentic - it's a valid signed Nostr event by the author. So seeding the draft is correct.
The issue is that the published (final) event has a DIFFERENT id than the draft. But fetchEventPackage
just verifies the downloaded event independently - it doesn't check that event.id matches the parent.
SO: the current two-phase approach is actually semantically OK. The gap is more subtle.
ACTUAL fix needed: After the final event is signed and published (step 5), ALSO seed the final event
so peers can find it by its actual ID. Currently only the draft is seeded.
Change: after `publishService.publishSigned(event)`, call `magnetBuilder.buildEventPackage(event)`
and DON'T include those tags (since event is already published). This seeds the final event.
The draft seed (from seedEvent) can stay as an additional seed.
Wait - re-reading the code. The bt tag magnet points to the torrent containing the draft. When a peer
fetches via the bt magnet, they get the draft. verifyEvent(draft) passes. verifySha256 passes.
They use draft as the event content. This is actually FINE since draft.content === final.content.
The only difference is the tags (draft has no bt/x tags, final has them).
So the semantic gap: the draft content IS the correct event content (same pubkey, content, replyTo).
The final event has extra bt/x tags that are metadata only.
CONCLUSION: Gap 2 may be less severe than thought. The content seeded IS authentic.
Proceed to fix Gap 1, 3, 4 which are more clear-cut.

### Gap 1 (Critical): Hydration re-seeds as leecher not seeder
File: src/ui/state/useP2PState.ts, lines ~100-130 (hydration effect)
Problem: For mode='seed' items, webtorrentHub.ensure(magnet) calls client.add() (leecher).
Without the original bytes, can't seed. WebTorrent's add() means "download this", not "seed this".
Fix: For mode='seed' items with an eventId, retrieve the event from NostrCache/IndexedDB and
re-seed it properly. Need to:
1. Add NostrCache as a parameter to useP2PState (it's available in P2PContext via useNostr())
2. In hydration, for mode='seed' items: fetch event from cache, canonicalise, re-seed via magnetBuilder
   BUT: magnetBuilder.buildEventPackage creates a NEW torrent - the magnet may differ from stored one.
   Actually magnets are content-addressed (info-hash), so same bytes = same magnet. Safe to re-seed.
3. For mode='seed' items WITHOUT eventId (media-only torrents): keep existing ensure() behavior
   since we can't recover media bytes (they're gone after session end).
Implementation: in useP2PState.ts, the hook receives nostr: NostrClient. NostrClient has a cache.
Check if NostrClient exposes cache access, or if NostrCache needs to be passed separately.
Look at src/ui/state/contexts/P2PContext.tsx - it has `const { nostr } = useNostr()` and passes
nostr to useP2PState. Check src/nostr/client.ts to see if it has getEvent/cache access.
Check src/nostr/cache.ts for the API.

### Gap 3 (Important): Relay-received events never seeded
File: src/ui/state/contexts/FeedContext.tsx and/or src/ui/state/useFeedState.ts
Problem: assistEvent only fetches from P2P. Events from relays are never seeded back.
Fix: In FeedContext.tsx, when events arrive from the feed (onNewEvents callback or similar),
if P2P seeding is enabled and the event has no bt tag already, call seedEvent on it.
BUT: seeding every relay event would be expensive. Limit to:
- Events from followed authors (the feed already filters this)
- Only when p2p.enabled AND some scope setting allows it
Look at how feed events are processed. The assistEvent callback is called for each new event.
Add a parallel seedRelayEvent path that calls seedEvent for events WITHOUT bt tags.
This should be opt-in via settings (e.g., settings.p2p.seedRelayEvents boolean).
Check src/storage/types.ts for P2PSettings to see if there's already such a setting.
If not, add it or check if the existing scope/preferEvents settings cover this.

### Gap 4 (Minor): transportStore.mark(eventId, { p2p: true }) before actual P2P transfer
File: src/ui/state/useP2PState.ts, lines ~249-251
Problem: When HTTP media has a magnet, p2p:true is marked even though no P2P transfer occurred.
Fix: Remove the premature p2p:true marking. Only mark p2p:true when result.source === 'p2p'.
The line `if (result.source === 'http' && shouldReseed) { transportStore.mark(eventId, { p2p: true }); }`
should be removed or changed to only mark when the actual transfer was P2P.

## Files to Read First
- src/nostr/client.ts (check for cache access methods)
- src/nostr/cache.ts (API for event retrieval)
- src/storage/types.ts (P2PSettings type)
- src/ui/state/useP2PState.ts (current state)
- src/ui/state/contexts/FeedContext.tsx (current state)
- src/ui/state/contexts/P2PContext.tsx (how nostr/cache are passed)

## After All Fixes
Run: npm run lint
Then: git add the changed files and commit with descriptive message.
