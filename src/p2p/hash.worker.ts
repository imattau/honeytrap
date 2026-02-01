self.onmessage = async (event) => {
  const data = event.data as { id: string; buffer: ArrayBuffer };
  try {
    const hash = await crypto.subtle.digest('SHA-256', data.buffer);
    const hex = Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    self.postMessage({ id: data.id, hex });
  } catch (err) {
    self.postMessage({ id: data.id, error: (err as Error).message ?? 'hash failed' });
  }
};
