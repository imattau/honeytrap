export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const buffer = data instanceof ArrayBuffer ? data : data.slice().buffer;
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function verifySha256(data: ArrayBuffer | Uint8Array, expected?: string): Promise<boolean> {
  if (!expected) return true;
  const actual = await sha256Hex(data);
  return actual.toLowerCase() === expected.toLowerCase();
}
