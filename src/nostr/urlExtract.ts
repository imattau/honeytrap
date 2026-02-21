import LinkifyIt from 'linkify-it';

const linkify = new LinkifyIt().set({
  fuzzyLink: false,
  fuzzyEmail: false,
  fuzzyIP: false
});

export function extractHttpUrls(text: string): string[] {
  const matches = linkify.match(text) ?? [];
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const match of matches) {
    if (!isHttpUrl(match.url)) continue;
    if (seen.has(match.url)) continue;
    seen.add(match.url);
    urls.push(match.url);
  }
  return urls;
}

function isHttpUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}
