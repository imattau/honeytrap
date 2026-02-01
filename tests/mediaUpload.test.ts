import { describe, it, expect, vi } from 'vitest';
import { MediaUploadService } from '../src/nostr/mediaUpload';

function makeService() {
  const signer = {} as any;
  const service = new MediaUploadService(signer);
  return service as MediaUploadService & { upload: (file: File, relay: string) => Promise<{ url: string; sha256?: string }> };
}

describe('MediaUploadService.uploadWithFallback', () => {
  it('tries preferred relay first then falls back', async () => {
    const service = makeService();
    const calls: string[] = [];
    service.upload = vi.fn(async (_file, relay) => {
      calls.push(relay);
      if (relay.includes('bad')) throw new Error('fail');
      const host = relay.replace(/^https?:\/\//, '');
      return { url: `https://${host}/ok` };
    });

    const file = {} as File;
    const result = await service.uploadWithFallback(file, ['https://bad.relay', 'https://good.relay'], undefined, 'https://bad.relay');

    expect(result.url).toBe('https://good.relay/ok');
    expect(calls).toEqual(['https://bad.relay', 'https://good.relay']);
  });
});
