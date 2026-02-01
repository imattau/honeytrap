import { useCallback, useMemo, useRef, useState } from 'react';
import type { KeyRecord } from '../../storage/types';
import { loadKeys, saveKeys } from '../../storage/db';
import { connectNip46, disconnectNip46, getNip07Pubkey, type Nip46Session } from '../../nostr/auth';
import { EventSigner } from '../../nostr/signer';
import { Nip44Cipher } from '../../nostr/nip44';

export function useAuthState() {
  const [keys, setKeys] = useState<KeyRecord | undefined>(undefined);
  const nip46SessionRef = useRef<Nip46Session | null>(null);

  const loadKeysFromStorage = useCallback(async () => {
    const stored = await loadKeys();
    setKeys(stored);
  }, []);

  const saveKeyRecord = useCallback(async (record: KeyRecord) => {
    await saveKeys(record);
    setKeys(record);
  }, []);

  const clearKeys = useCallback(async () => {
    await saveKeys({ npub: '' });
    setKeys(undefined);
    nip46SessionRef.current = null;
  }, []);

  const connectRemoteSigner = useCallback(async (
    input: string,
    onAuthUrl?: (url: string) => void,
    clientSecretKey?: Uint8Array
  ) => {
    const session = await connectNip46(input, onAuthUrl, clientSecretKey);
    nip46SessionRef.current = session;
    await saveKeyRecord({ npub: session.pubkey });
    return session.pubkey;
  }, [saveKeyRecord]);

  const connectNip07 = useCallback(async () => {
    const pubkey = await getNip07Pubkey();
    await saveKeyRecord({ npub: pubkey });
  }, [saveKeyRecord]);

  const disconnectRemoteSigner = useCallback(() => {
    disconnectNip46(nip46SessionRef.current ?? undefined);
    nip46SessionRef.current = null;
  }, []);

  const signer = useMemo(() => new EventSigner(() => keys, () => nip46SessionRef.current), [keys]);
  const nip44Cipher = useMemo(() => new Nip44Cipher(() => keys), [keys]);

  return {
    keys,
    signer,
    nip44Cipher,
    nip46SessionRef,
    loadKeysFromStorage,
    saveKeyRecord,
    clearKeys,
    connectNip07,
    connectRemoteSigner,
    disconnectRemoteSigner
  };
}
