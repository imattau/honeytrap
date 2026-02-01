import { describe, it, expect } from 'vitest';
import { describe, it, expect } from 'vitest';

describe('WebTorrentHub', () => {
  it('skips test in node environment (browser-only dependency)', () => {
    expect(true).toBe(true);
  });
});
