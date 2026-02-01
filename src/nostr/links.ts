import type { NostrEvent } from './types';

const mediaExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp4', '.webm', '.mov'];

export type LinkPreviewSource = {
  url: string;
  type: 'link';
};

export function extractLinks(event: NostrEvent): LinkPreviewSource[] {
  const urls = extractUrls(event.content);
  return urls
    .filter((url) => !mediaExtensions.some((ext) => url.toLowerCase().includes(ext)))
    .map((url) => ({ url, type: 'link' as const }));
}

function extractUrls(text: string): string[] {
  const regex = /(https?:\/\/[^\s]+)/g;
  return text.match(regex) ?? [];
}
