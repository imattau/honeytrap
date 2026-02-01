type Pending = {
  resolve: (value: string) => void;
  reject: (reason?: unknown) => void;
};

export class HashWorkerPool {
  private worker?: Worker;
  private pending = new Map<string, Pending>();

  constructor(private enabled = typeof Worker !== 'undefined') {
    if (this.enabled) {
      this.worker = new Worker(new URL('./hash.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event) => {
        const data = event.data as { id: string; hex?: string; error?: string };
        const entry = this.pending.get(data.id);
        if (!entry) return;
        this.pending.delete(data.id);
        if (data.error) entry.reject(new Error(data.error));
        else entry.resolve(data.hex ?? '');
      };
    }
  }

  async hash(buffer: ArrayBuffer): Promise<string> {
    if (!this.worker) {
      return hashOnMain(buffer);
    }
    const id = crypto.randomUUID();
    const promise = new Promise<string>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.worker.postMessage({ id, buffer }, [buffer]);
    return promise;
  }

  destroy() {
    this.worker?.terminate();
    this.pending.clear();
    this.worker = undefined;
  }
}

export async function hashOnMain(buffer: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
