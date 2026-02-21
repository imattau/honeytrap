import type { NostrEvent } from './types';

type TimelineListener = () => void;
const TIMELINE_CHANGE_EVENT = 'change';

export class FeedTimelineCache {
  private events: NostrEvent[] = [];
  private target = new EventTarget();

  snapshot(): NostrEvent[] {
    return this.events;
  }

  set(events: NostrEvent[]) {
    this.events = events;
    this.emit();
  }

  reset() {
    this.events = [];
    this.emit();
  }

  subscribe(listener: TimelineListener) {
    const handler = () => listener();
    this.target.addEventListener(TIMELINE_CHANGE_EVENT, handler);
    return () => {
      this.target.removeEventListener(TIMELINE_CHANGE_EVENT, handler);
    };
  }

  private emit() {
    this.target.dispatchEvent(new Event(TIMELINE_CHANGE_EVENT));
  }
}
