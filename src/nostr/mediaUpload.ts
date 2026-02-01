import type { EventSigner } from './signer';
import { sha256Hex } from '../p2p/verify';

export interface UploadResult {
  url: string;
  sha256?: string;
}

export class MediaUploadService {
  constructor(private signer: EventSigner) {}

  async upload(file: File, relayBase: string): Promise<UploadResult> {
    const apiUrl = await this.resolveApiUrl(relayBase);
    const payloadHash = await sha256Hex(await file.arrayBuffer());
    const payloadBase64 = toBase64Hex(payloadHash);
    const authEvent = await this.signer.signEvent({
      kind: 27235,
      created_at: Math.floor(Date.now() / 1000),
      content: '',
      tags: [
        ['u', apiUrl],
        ['method', 'POST'],
        ['payload', payloadBase64]
      ]
    });
    const form = new FormData();
    form.append('file', file);
    form.append('size', String(file.size));
    if (file.type) form.append('content_type', file.type);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Nostr ${btoa(JSON.stringify(authEvent))}`
      },
      body: form
    });

    if (!response.ok) {
      throw new Error(`Upload failed (${response.status})`);
    }

    const data = (await response.json()) as {
      status?: string;
      nip94_event?: { tags?: string[][] };
    };
    const tags = data.nip94_event?.tags ?? [];
    const url = tags.find((tag) => tag[0] === 'url')?.[1];
    const ox = tags.find((tag) => tag[0] === 'ox')?.[1];
    if (!url) {
      throw new Error('Upload response missing url');
    }
    return { url, sha256: ox || payloadHash };
  }

  private async resolveApiUrl(relayBase: string): Promise<string> {
    const base = relayBase.replace(/\/$/, '');
    const wellKnown = `${base}/.well-known/nostr/nip96.json`;
    try {
      const response = await fetch(wellKnown);
      if (response.ok) {
        const data = await response.json() as { api_url?: string; delegated_to_url?: string };
        if (data.delegated_to_url) {
          return this.resolveApiUrl(data.delegated_to_url);
        }
        if (data.api_url) return data.api_url;
      }
    } catch {
      // fall back below
    }
    return `${base}/upload`;
  }
}

function toBase64Hex(hex: string): string {
  const bytes = hex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) ?? [];
  const uint8 = new Uint8Array(bytes);
  let binary = '';
  uint8.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}
