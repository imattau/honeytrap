import { describe, it, expect, vi } from 'vitest';
import { hashOnMain } from '../src/p2p/hashWorker';
import { sha256Hex } from '../src/p2p/verify';

// Tiny buffer should use main thread path deterministically

describe('hashing', () => {
  it('hashOnMain matches sha256Hex for small buffers', async () => {
    const data = new TextEncoder().encode('hello').buffer;
    const main = await hashOnMain(data);
    const via = await sha256Hex(data);
    expect(via).toBe(main);
  });

  it('sha256Hex falls back to main thread for small buffers', async () => {
    const spy = vi.spyOn(globalThis.crypto.subtle, 'digest');
    const data = new TextEncoder().encode('small').buffer;
    await sha256Hex(data);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
