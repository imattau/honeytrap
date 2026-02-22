import { describe, expect, it, vi } from 'vitest';
import { PeopleListService } from '../src/nostr/lists';

describe('PeopleListService.publish', () => {
  it('reuses provided identifier when updating an existing list', async () => {
    const publishEvent = vi.fn(async () => undefined);
    const signEvent = vi.fn(async (event: any) => ({
      id: 'evt-1',
      pubkey: 'f'.repeat(64),
      sig: 'a'.repeat(128),
      ...event
    }));
    const service = new PeopleListService(
      { publishEvent } as any,
      { signEvent } as any
    );

    await service.publish({
      title: 'My Renamed List',
      identifier: 'friends',
      pubkeys: ['a'.repeat(64), 'b'.repeat(64)]
    });

    expect(signEvent).toHaveBeenCalledOnce();
    const signedInput = signEvent.mock.calls[0]?.[0];
    expect(signedInput.kind).toBe(30000);
    expect(signedInput.tags).toEqual(expect.arrayContaining([
      ['d', 'friends'],
      ['title', 'My Renamed List'],
      ['p', 'a'.repeat(64)],
      ['p', 'b'.repeat(64)]
    ]));
    expect(publishEvent).toHaveBeenCalledOnce();
  });

  it('derives identifier from title when creating a new list', async () => {
    const publishEvent = vi.fn(async () => undefined);
    const signEvent = vi.fn(async (event: any) => ({
      id: 'evt-2',
      pubkey: 'f'.repeat(64),
      sig: 'a'.repeat(128),
      ...event
    }));
    const service = new PeopleListService(
      { publishEvent } as any,
      { signEvent } as any
    );

    await service.publish({
      title: 'Close Friends 2026!',
      pubkeys: ['a'.repeat(64)]
    });

    const signedInput = signEvent.mock.calls[0]?.[0];
    expect(signedInput.tags).toEqual(expect.arrayContaining([
      ['d', 'close-friends-2026'],
      ['title', 'Close Friends 2026!']
    ]));
  });
});
