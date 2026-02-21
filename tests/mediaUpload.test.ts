import { describe, it, expect, vi } from 'vitest';
import { MediaUploadService } from '../src/nostr/mediaUpload';

vi.mock('../src/p2p/verify', () => ({
  sha256Hex: vi.fn(async () => '00ff')
}));

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

  it('encodes NIP-98 payload hash tag as base64 using library encoder', async () => {
    const originalFetch = globalThis.fetch;
    const originalXHR = (globalThis as any).XMLHttpRequest;
    const signer = {
      signEvent: vi.fn(async (event: any) => ({
        ...event,
        id: 'id',
        pubkey: 'f'.repeat(64),
        sig: 'a'.repeat(128)
      }))
    };
    const service = new MediaUploadService(signer as any);
    (globalThis as any).fetch = vi.fn(async () => ({ ok: false }));

    let authHeader = '';
    class MockXHR {
      status = 200;
      responseText = '';
      upload = { onprogress: null as ((event: ProgressEvent<EventTarget>) => void) | null };
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      open(_method: string, _url: string, _async: boolean) {}

      setRequestHeader(name: string, value: string) {
        if (name === 'Authorization') authHeader = value;
      }

      send(_body: FormData) {
        this.responseText = JSON.stringify({
          nip94_event: { tags: [['url', 'https://good.relay/ok']] }
        });
        this.onload?.();
      }
    }
    (globalThis as any).XMLHttpRequest = MockXHR as any;

    try {
      const file = new File([new Uint8Array([1, 2, 3])], 'a.bin', { type: 'application/octet-stream' });
      const result = await service.upload(file, 'https://relay.example');
      expect(result.url).toBe('https://good.relay/ok');

      const signed = signer.signEvent.mock.calls[0][0];
      const payloadTag = signed.tags.find((tag: string[]) => tag[0] === 'payload');
      expect(payloadTag?.[1]).toBe('AP8=');
      expect(authHeader.startsWith('Nostr ')).toBe(true);
    } finally {
      (globalThis as any).fetch = originalFetch;
      (globalThis as any).XMLHttpRequest = originalXHR;
    }
  });

  it('fails on malformed NIP-94 upload payload', async () => {
    const originalFetch = globalThis.fetch;
    const originalXHR = (globalThis as any).XMLHttpRequest;
    const signer = {
      signEvent: vi.fn(async (event: any) => ({
        ...event,
        id: 'id',
        pubkey: 'f'.repeat(64),
        sig: 'a'.repeat(128)
      }))
    };
    const service = new MediaUploadService(signer as any);
    (globalThis as any).fetch = vi.fn(async () => ({ ok: false }));

    class MockXHR {
      status = 200;
      responseText = '';
      upload = { onprogress: null as ((event: ProgressEvent<EventTarget>) => void) | null };
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      open(_method: string, _url: string, _async: boolean) {}

      setRequestHeader(_name: string, _value: string) {}

      send(_body: FormData) {
        this.responseText = JSON.stringify({
          nip94_event: { tags: ['broken'] }
        });
        this.onload?.();
      }
    }
    (globalThis as any).XMLHttpRequest = MockXHR as any;

    try {
      const file = new File([new Uint8Array([1, 2, 3])], 'a.bin', { type: 'application/octet-stream' });
      await expect(service.upload(file, 'https://relay.example')).rejects.toThrow('Upload response malformed');
    } finally {
      (globalThis as any).fetch = originalFetch;
      (globalThis as any).XMLHttpRequest = originalXHR;
    }
  });
});
