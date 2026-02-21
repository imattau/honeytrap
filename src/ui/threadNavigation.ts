import { flushSync } from 'react-dom';
import type { NavigateFunction } from 'react-router-dom';
import type { NostrEvent } from '../nostr/types';
import { stashThreadPreview } from './threadPreviewCache';

export function openThread(navigate: NavigateFunction, event: NostrEvent) {
  stashThreadPreview(event);
  flushSync(() => {
    navigate(`/thread/${event.id}`);
  });
}
