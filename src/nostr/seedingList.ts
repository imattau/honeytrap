import type { NostrEvent, NostrTag } from './types';
import type { NostrClient } from './client';
import type { EventSigner } from './signer';
import type { TorrentMode, TorrentStatus } from '../p2p/registry';

const CACHE_TTL_MS = 3 * 60 * 1000;
const MAX_TAGS = 150;

export interface SeedingHint {
  magnet: string;
  mode: TorrentMode;
  eventId?: string;
  url?: string;
  authorPubkey?: string;
  availableUntil?: number;
  updatedAt: number;
}

export class SeedingListService {
  private readonly listId = 'honeytrap-seeding';
  private readonly listTitle = 'Honeytrap Seeding';
  private cache = new Map<string, { loadedAt: number; hints: SeedingHint[] }>();

  constructor(
    private nostr: NostrClient,
    private signer: EventSigner
  ) {}

  async publish(items: TorrentStatus[]): Promise<NostrEvent | undefined> {
    const hints = buildPublishHints(items);
    if (hints.length === 0) return undefined;
    const tags: NostrTag[] = [
      ['d', this.listId],
      ['title', this.listTitle],
      ['type', this.listId],
      ['format', 'v1']
    ];
    hints.forEach((hint) => {
      const tag: NostrTag = ['bt', hint.magnet, hint.mode];
      if (hint.eventId) tag.push(`e=${hint.eventId}`);
      if (hint.url) tag.push(`u=${hint.url}`);
      if (hint.authorPubkey) tag.push(`p=${hint.authorPubkey}`);
      if (hint.availableUntil !== undefined) tag.push(`until=${hint.availableUntil}`);
      tag.push(`updated=${hint.updatedAt}`);
      tags.push(tag);
    });
    const event = await this.signer.signEvent({
      kind: 30000,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: ''
    });
    await this.nostr.publishEvent(event);
    this.cache.set(event.pubkey, { loadedAt: Date.now(), hints });
    return event;
  }

  async load(pubkey: string, force = false): Promise<SeedingHint[]> {
    const normalizedPubkey = pubkey.trim();
    if (!normalizedPubkey) return [];
    const cached = this.cache.get(normalizedPubkey);
    const now = Date.now();
    if (!force && cached && now - cached.loadedAt < CACHE_TTL_MS) {
      return cached.hints;
    }
    const event = await this.nostr.fetchListEvent(normalizedPubkey, this.listId, 30000);
    if (!event) {
      this.cache.set(normalizedPubkey, { loadedAt: now, hints: [] });
      return [];
    }
    const hints = parseHints(event, normalizedPubkey);
    this.cache.set(normalizedPubkey, { loadedAt: now, hints });
    return hints;
  }

  async resolve(
    pubkey: string,
    input: { eventId?: string; url?: string },
    force = false
  ): Promise<SeedingHint | undefined> {
    const hints = await this.load(pubkey, force);
    const now = Date.now();
    const fresh = hints.filter((hint) => hint.availableUntil === undefined || now <= hint.availableUntil);
    const eventId = input.eventId?.trim();
    if (eventId) {
      const byEvent = fresh.find((hint) => hint.eventId === eventId);
      if (byEvent) return byEvent;
    }
    const url = input.url?.trim();
    if (url) {
      const byUrl = fresh.find((hint) => hint.url === url);
      if (byUrl) return byUrl;
    }
    return undefined;
  }

  clearCache(pubkey?: string) {
    if (pubkey) {
      this.cache.delete(pubkey.trim());
      return;
    }
    this.cache.clear();
  }
}

function buildPublishHints(items: TorrentStatus[]): SeedingHint[] {
  const now = Date.now();
  return items
    .filter((item) => Boolean(item.magnet))
    .filter((item) => item.availableUntil === undefined || now <= item.availableUntil)
    .filter((item) => item.active)
    .filter((item) => item.mode === 'seed' || item.progress >= 0.999 || item.uploaded > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_TAGS)
    .map((item) => ({
      magnet: item.magnet,
      mode: item.mode,
      eventId: item.eventId,
      url: item.url,
      authorPubkey: item.authorPubkey,
      availableUntil: item.availableUntil,
      updatedAt: item.updatedAt
    }));
}

function parseHints(event: NostrEvent, fallbackPubkey: string): SeedingHint[] {
  return event.tags
    .filter((tag) => tag[0] === 'bt' && Boolean(tag[1]))
    .map((tag) => {
      const values = new Map<string, string>();
      tag.slice(3).forEach((part) => {
        const separator = part.indexOf('=');
        if (separator <= 0) return;
        values.set(part.slice(0, separator), part.slice(separator + 1));
      });
      const mode = parseMode(tag[2]);
      const until = parseNumber(values.get('until'));
      const updatedAt = parseNumber(values.get('updated')) ?? event.created_at * 1000;
      return {
        magnet: tag[1],
        mode,
        eventId: values.get('e'),
        url: values.get('u'),
        authorPubkey: values.get('p') ?? fallbackPubkey,
        availableUntil: until,
        updatedAt
      } as SeedingHint;
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function parseMode(value?: string): TorrentMode {
  if (value === 'fetch') return 'fetch';
  return 'seed';
}

function parseNumber(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
