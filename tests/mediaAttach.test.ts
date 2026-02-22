import { describe, expect, it, vi } from 'vitest';
import { MediaAttachService } from '../src/p2p/mediaAttach';

describe('MediaAttachService', () => {
  it('relay mode uploads and includes seeded magnet when available', async () => {
    const uploader = vi.fn(async () => ({ url: 'https://cdn.example/file.jpg', sha256: 'relay-sha' }));
    const seeder = vi.fn(async () => ({ url: 'p2p://sha256:seed-sha', magnet: 'magnet:?xt=urn:btih:seed', sha256: 'seed-sha' }));
    const service = new MediaAttachService(uploader, seeder);

    const file = new File([new Uint8Array([1, 2, 3])], 'file.jpg', { type: 'image/jpeg' });
    const result = await service.attach([file], 'relay', { relays: ['https://relay.example'] });

    expect(uploader).toHaveBeenCalledTimes(1);
    expect(seeder).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      {
        url: 'https://cdn.example/file.jpg',
        sha256: 'relay-sha',
        magnet: 'magnet:?xt=urn:btih:seed'
      }
    ]);
  });

  it('relay mode still succeeds when seeding fails', async () => {
    const uploader = vi.fn(async () => ({ url: 'https://cdn.example/file.jpg', sha256: undefined }));
    const seeder = vi.fn(async () => {
      throw new Error('seed unavailable');
    });
    const service = new MediaAttachService(uploader, seeder);

    const file = new File([new Uint8Array([4, 5, 6])], 'file.jpg', { type: 'image/jpeg' });
    const result = await service.attach([file], 'relay', { relays: ['https://relay.example'] });

    expect(uploader).toHaveBeenCalledTimes(1);
    expect(seeder).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      {
        url: 'https://cdn.example/file.jpg',
        sha256: undefined,
        magnet: undefined
      }
    ]);
  });

  it('p2p mode uses seeder result directly', async () => {
    const uploader = vi.fn(async () => ({ url: 'https://cdn.example/file.jpg', sha256: 'relay-sha' }));
    const seeder = vi.fn(async () => ({ url: 'p2p://sha256:seed-sha', magnet: 'magnet:?xt=urn:btih:seed', sha256: 'seed-sha' }));
    const service = new MediaAttachService(uploader, seeder);

    const file = new File([new Uint8Array([7, 8, 9])], 'file.jpg', { type: 'image/jpeg' });
    const result = await service.attach([file], 'p2p', { relays: ['https://relay.example'] });

    expect(seeder).toHaveBeenCalledTimes(1);
    expect(uploader).toHaveBeenCalledTimes(0);
    expect(result).toEqual([
      {
        url: 'p2p://sha256:seed-sha',
        sha256: 'seed-sha',
        magnet: 'magnet:?xt=urn:btih:seed'
      }
    ]);
  });
});
