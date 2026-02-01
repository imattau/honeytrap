export type MediaAttachMode = 'relay' | 'p2p';

export type MediaAttachResult = {
  url: string;
  sha256?: string;
  magnet?: string;
};

export interface MediaAttachOptions {
  relays: string[];
  preferredRelay?: string;
  onProgress?: (percent: number) => void;
}

export class MediaAttachService {
  constructor(
    private uploader: (file: File, relays: string[], onProgress?: (percent: number) => void, preferredRelay?: string) => Promise<{ url: string; sha256?: string }>,
    private seeder: (file: File) => Promise<{ url: string; magnet: string; sha256: string }>
  ) {}

  async attach(files: File[], mode: MediaAttachMode, options: MediaAttachOptions): Promise<MediaAttachResult[]> {
    const results: MediaAttachResult[] = [];
    for (const file of files) {
      if (mode === 'p2p') {
        const seeded = await this.seeder(file);
        options.onProgress?.(100);
        results.push(seeded);
      } else {
        const uploaded = await this.uploader(file, options.relays, options.onProgress, options.preferredRelay);
        results.push(uploaded);
      }
    }
    return results;
  }
}
