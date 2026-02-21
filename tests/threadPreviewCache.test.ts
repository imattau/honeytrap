import { describe, expect, it } from 'vitest';
import { getThreadPreview, stashThreadPreview } from '../src/ui/threadPreviewCache';
import type { NostrEvent } from '../src/nostr/types';

function makeEvent(id: string): NostrEvent {
  return {
    id,
    pubkey: 'thread-preview-author',
    created_at: Math.floor(Date.now() / 1000),
    kind: 1,
    tags: [],
    content: `preview-${id}`,
    sig: `sig-${id}`
  };
}

describe('threadPreviewCache', () => {
  it('returns stashed preview immediately', () => {
    const id = `preview-now-${Date.now()}`;
    const event = makeEvent(id);
    stashThreadPreview(event);
    expect(getThreadPreview(id)).toEqual(event);
  });

  it('keeps cache bounded and evicts oldest previews', () => {
    const prefix = `preview-cap-${Date.now()}`;
    const firstId = `${prefix}-0`;
    const lastId = `${prefix}-69`;
    for (let i = 0; i < 70; i += 1) {
      stashThreadPreview(makeEvent(`${prefix}-${i}`));
    }
    expect(getThreadPreview(firstId)).toBeUndefined();
    expect(getThreadPreview(lastId)?.id).toBe(lastId);
  });
});
