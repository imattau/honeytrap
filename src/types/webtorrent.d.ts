declare module 'webtorrent' {
  export interface TorrentFile {
    length: number;
    getBuffer(cb: (err: Error | null, data?: Uint8Array) => void): void;
  }

  export interface Torrent {
    files: TorrentFile[];
    ready: boolean;
    once(event: 'ready', cb: () => void): void;
    destroy(): void;
  }

  export default class WebTorrent {
    constructor(opts?: any);
    add(magnet: string, cb: (torrent: Torrent) => void): Torrent;
    destroy(): void;
  }
}

declare module 'webtorrent/dist/webtorrent.min.js' {
  import WebTorrent from 'webtorrent';
  export default WebTorrent;
}
