import { HashWorkerPool, hashOnMain } from './hashWorker';

const workerPool = new HashWorkerPool();
const WORKER_THRESHOLD_BYTES = 1024 * 1024 * 2;

export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const buffer = data instanceof ArrayBuffer ? data.slice(0) : data.slice().buffer;
  if (buffer.byteLength >= WORKER_THRESHOLD_BYTES) {
    return workerPool.hash(buffer);
  }
  return hashOnMain(buffer);
}

export async function verifySha256(data: ArrayBuffer | Uint8Array, expected?: string): Promise<boolean> {
  if (!expected) return true;
  const actual = await sha256Hex(data);
  return actual.toLowerCase() === expected.toLowerCase();
}
