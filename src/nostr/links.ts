import type { NostrEvent } from './types';
import { extractHttpUrls } from './urlExtract';

const mediaExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp4', '.webm', '.mov'];

export type LinkPreviewSource = {
  url: string;
  type: 'link';
};

export function extractLinks(event: NostrEvent): LinkPreviewSource[] {
  const urls = extractHttpUrls(event.content);
  return urls
    .filter((url) => !mediaExtensions.some((ext) => url.toLowerCase().includes(ext)))
    .map((url) => ({ url, type: 'link' as const }));
}
