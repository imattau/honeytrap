import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { useAuthState } from '../useAuthState';
import type { KeyRecord } from '../../../storage/types';
import type { ProfileMetadata } from '../../../nostr/types';

interface AuthContextValue {
  keys?: KeyRecord;
  signer: any; // Using any for now to match the existing hook's return type
  nip44Cipher: any;
  saveKeyRecord: (record: KeyRecord) => Promise<void>;
  clearKeys: () => Promise<void>;
  connectNip07: () => Promise<void>;
  connectNip46: (input: string, onAuthUrl?: (url: string) => void, clientSecretKey?: Uint8Array) => Promise<string>;
  disconnectNip46: () => void;
  isAuthed: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const authState = useAuthState();

  useEffect(() => {
    authState.loadKeysFromStorage();
  }, [authState.loadKeysFromStorage]);

  const value = useMemo(() => ({
    keys: authState.keys,
    signer: authState.signer,
    nip44Cipher: authState.nip44Cipher,
    saveKeyRecord: authState.saveKeyRecord,
    clearKeys: authState.clearKeys,
    connectNip07: authState.connectNip07,
    connectNip46: authState.connectRemoteSigner,
    disconnectNip46: authState.disconnectRemoteSigner,
    isAuthed: Boolean(authState.keys?.npub)
  }), [authState]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
