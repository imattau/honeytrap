declare module 'webtorrent' {
  export interface TorrentFile {
    length: number;
    arrayBuffer(): Promise<ArrayBuffer>;
    getBuffer(cb: (err: Error | null, data?: Uint8Array) => void): void;
  }

  export interface Torrent {
    files: TorrentFile[];
    ready: boolean;
    name?: string;
    magnetURI?: string;
    numPeers?: number;
    progress?: number;
    downloaded?: number;
    uploaded?: number;
    once(event: 'ready', cb: () => void): void;
    on(event: 'download' | 'upload' | 'wire' | 'noPeers' | 'done' | 'error' | 'close', cb: () => void): void;
    destroy(): void;
  }

  export default class WebTorrent {
    constructor(opts?: any);
    add(magnet: string, opts: any, cb: (torrent: Torrent) => void): Torrent;
    add(magnet: string, cb: (torrent: Torrent) => void): Torrent;
    seed(file: File | Blob | ArrayBuffer | Uint8Array, opts: any, cb: (torrent: Torrent) => void): Torrent;
    seed(file: File | Blob | ArrayBuffer | Uint8Array, cb: (torrent: Torrent) => void): Torrent;
    get(magnet: string): Torrent | undefined;
    destroy(): void;
  }
}

declare module 'webtorrent/dist/webtorrent.min.js' {
  import WebTorrent from 'webtorrent';
  export default WebTorrent;
}
