import { verifyEvent } from 'nostr-tools';
import type { NostrEvent } from '../nostr/types';
import { canonicaliseEvent } from './canonical';
import { verifySha256 } from './verify';
import type { AssistSource } from './types';
import type { WebTorrentAssist } from './webtorrent';

export function extractEventAssist(event: NostrEvent): { magnet?: string; sha256?: string } {
  const bt = event.tags.find((tag) => tag[0] === 'bt' && tag[2] === 'event');
  const x = event.tags.find((tag) => tag[0] === 'x' && tag[2] === 'event');
  return {
    magnet: bt?.[1],
    sha256: x?.[1]?.replace('sha256:', '')
  };
}

export async function fetchEventPackage({
  event,
  p2p,
  allowP2P
}: {
  event: NostrEvent;
  p2p: WebTorrentAssist;
  allowP2P: boolean;
}): Promise<NostrEvent | undefined> {
  const assist = extractEventAssist(event);
  if (!assist.magnet) return undefined;
  const source: AssistSource = {
    magnet: assist.magnet,
    url: '',
    sha256: assist.sha256,
    type: 'event'
  };
  const result = await p2p.fetchWithAssist(source, 2500, allowP2P);
  const text = new TextDecoder().decode(result.data);
  const parsed = JSON.parse(text) as NostrEvent;
  if (!verifyEvent(parsed as any)) return undefined;
  const canonical = canonicaliseEvent(parsed);
  const verified = await verifySha256(canonical, assist.sha256);
  if (!verified) return undefined;
  return parsed;
}
