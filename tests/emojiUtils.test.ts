import { describe, expect, it } from 'vitest';
import { extractEmojiMap, stripInvisibleSeparators, tokenizeLineWithEmojiAndHashtags } from '../src/nostr/utils';

describe('emoji utils', () => {
  it('extracts emoji shortcodes from event tags', () => {
    const map = extractEmojiMap([
      ['emoji', 'supertada', 'https://cdn.example.com/supertada.webp'],
      ['emoji', 'AI_YAYSUPERFAST', 'https://cdn.example.com/ai-fast.webp'],
      ['e', 'ignored']
    ]);

    expect(map.supertada).toBe('https://cdn.example.com/supertada.webp');
    expect(map.ai_yaysuperfast).toBe('https://cdn.example.com/ai-fast.webp');
    expect(map.AI_YAYSUPERFAST).toBe('https://cdn.example.com/ai-fast.webp');
  });

  it('removes zero-width separators from text', () => {
    const value = ':supertada:\u200B\u200C\u200D\uFEFF:ai_yaysuperfast:';
    expect(stripInvisibleSeparators(value)).toBe(':supertada::ai_yaysuperfast:');
  });

  it('tokenizes hashtag and emoji shortcodes in one line', () => {
    const tokens = tokenizeLineWithEmojiAndHashtags(
      'Hello #Nostr :supertada:\u200B:unknown:',
      { supertada: 'https://cdn.example.com/supertada.webp' }
    );

    expect(tokens).toEqual([
      { type: 'text', value: 'Hello ' },
      { type: 'hashtag', value: 'Nostr' },
      { type: 'text', value: ' ' },
      { type: 'emoji', value: 'supertada', url: 'https://cdn.example.com/supertada.webp' },
      { type: 'text', value: ':unknown:' }
    ]);
  });
});
