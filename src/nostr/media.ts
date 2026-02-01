import type { NostrEvent } from './types';

const mediaExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp4', '.webm', '.mov'];

export type MediaSource = {
  url: string;
  magnet?: string;
  sha256?: string;
  type: 'media';
};

export function extractMedia(event: NostrEvent): MediaSource[] {
  const urls = extractUrls(event.content);
  const btTags = event.tags.filter((tag) => tag[0] === 'bt');
  const xTags = event.tags.filter((tag) => tag[0] === 'x');

  return urls.map((url) => {
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
  const regex = /(https?:\/\/[^\s]+)/g;
  const matches = text.match(regex) ?? [];
  return matches.filter((url) => mediaExtensions.some((ext) => url.toLowerCase().includes(ext)));
}
