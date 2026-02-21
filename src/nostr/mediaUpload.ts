import type { EventSigner } from './signer';
import { sha256Hex } from '../p2p/verify';
import { hexToBytes } from 'nostr-tools/utils';
import { base64 } from '@scure/base';
import { z } from 'zod';
import { parseJsonResponse, parseJsonString } from './validation';

export interface UploadResult {
  url: string;
  sha256?: string;
}

const nip96Schema = z.object({
  api_url: z.string().min(1).optional(),
  delegated_to_url: z.string().min(1).optional()
}).passthrough();

const uploadResponseSchema = z.object({
  status: z.string().optional(),
  nip94_event: z.object({
    tags: z.array(z.array(z.string())).optional()
  }).optional()
}).passthrough();

export class MediaUploadService {
  constructor(private signer: EventSigner) {}

  async upload(file: File, relayBase: string, onProgress?: (percent: number) => void): Promise<UploadResult> {
    const apiUrl = await this.resolveApiUrl(relayBase);
    const payloadHash = await sha256Hex(await file.arrayBuffer());
    const payloadBase64 = hexToBase64(payloadHash);
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

    const responseText = await new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', apiUrl, true);
      xhr.setRequestHeader('Authorization', `Nostr ${btoa(JSON.stringify(authEvent))}`);
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress?.(percent);
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(xhr.responseText);
        } else {
          reject(new Error(`Upload failed (${xhr.status})`));
        }
      };
      xhr.onerror = () => reject(new Error('Upload failed'));
      xhr.send(form);
    });

    const data = parseJsonString(responseText, uploadResponseSchema, 'Upload response malformed');
    const tags = data.nip94_event?.tags ?? [];
    const url = tags.find((tag) => tag[0] === 'url')?.[1];
    const ox = tags.find((tag) => tag[0] === 'ox')?.[1];
    if (!url) {
      throw new Error('Upload response missing url');
    }
    return { url, sha256: ox || payloadHash };
  }

  async uploadWithFallback(
    file: File,
    relays: string[],
    onProgress?: (percent: number) => void,
    preferredRelay?: string
  ): Promise<UploadResult> {
    const unique = dedupeRelays(relays, preferredRelay);
    let lastError: unknown;
    for (const relay of unique) {
      try {
        return await this.upload(file, relay, onProgress);
      } catch (err) {
        lastError = err;
      }
    }
    const reason = lastError instanceof Error ? lastError.message : 'Upload failed';
    throw new Error(`${reason}. Tried ${unique.length} relay(s).`);
  }

  private async resolveApiUrl(relayBase: string): Promise<string> {
    const base = relayBase.replace(/\/$/, '');
    const wellKnown = `${base}/.well-known/nostr/nip96.json`;
    try {
      const response = await fetch(wellKnown);
      if (response.ok) {
        const data = await parseJsonResponse(response, nip96Schema, 'Invalid NIP-96 response');
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

function hexToBase64(hex: string): string {
  return base64.encode(hexToBytes(hex));
}

function dedupeRelays(relays: string[], preferredRelay?: string) {
  const list = relays.map((relay) => relay.trim()).filter(Boolean);
  const ordered: string[] = [];
  if (preferredRelay) ordered.push(preferredRelay.trim());
  list.forEach((relay) => ordered.push(relay));
  const seen = new Set<string>();
  return ordered.filter((relay) => {
    if (!relay || seen.has(relay)) return false;
    seen.add(relay);
    return true;
  });
}
