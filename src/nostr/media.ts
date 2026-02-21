import type { NostrEvent } from './types';
import { extractHttpUrls } from './urlExtract';

const mediaExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp4', '.webm', '.mov'];

export type MediaSource = {
  url: string;
  magnet?: string;
  sha256?: string;
  type: 'media';
};

export function extractMedia(event: NostrEvent): MediaSource[] {
  const urls = new Set<string>(extractUrls(event.content));
  const btTags = event.tags.filter((tag) => tag[0] === 'bt');
  const xTags = event.tags.filter((tag) => tag[0] === 'x');

  btTags.forEach((tag) => {
    const url = tag.find((part) => part.startsWith('url='))?.slice(4);
    if (url) urls.add(url);
  });
  xTags.forEach((tag) => {
    const url = tag.find((part) => part.startsWith('url='))?.slice(4);
    if (url) urls.add(url);
  });

  return Array.from(urls).map((url) => {
    const bt = btTags.find((tag) => tag[2] === 'media' && tag[3]?.startsWith(`url=${url}`));
    const x = xTags.find((tag) => tag[2]?.startsWith(`url=${url}`));
    return {
      url,
      magnet: bt?.[1],
      sha256: x?.[1]?.replace('sha256:', ''),
      type: 'media'
    };
  });
}

function extractUrls(text: string): string[] {
  const matches = extractHttpUrls(text);
  return matches.filter((url) => mediaExtensions.some((ext) => url.toLowerCase().includes(ext)));
}
