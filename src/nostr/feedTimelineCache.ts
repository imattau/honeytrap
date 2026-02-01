import type { NostrEvent } from './types';

type TimelineListener = () => void;

export class FeedTimelineCache {
  private events: NostrEvent[] = [];
  private listeners = new Set<TimelineListener>();

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
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit() {
    this.listeners.forEach((listener) => listener());
  }
}
