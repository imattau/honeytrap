import React from 'react';
import { SettingsProvider } from './contexts/SettingsContext';
import { AuthProvider } from './contexts/AuthContext';
import { NostrProvider } from './contexts/NostrContext';
import { TransportProvider } from './contexts/TransportContext';
import { RelayProvider } from './contexts/RelayContext';
import { SocialProvider } from './contexts/SocialContext';
import { P2PProvider } from './contexts/P2PContext';
import { FeedProvider } from './contexts/FeedContext';

export function RootProvider({ children }: { children: React.ReactNode }) {
  return (
    <SettingsProvider>
      <AuthProvider>
        <NostrProvider>
          <TransportProvider>
            <RelayProvider>
              <SocialProvider>
                <P2PProvider>
                  <FeedProvider>
                    {children}
                  </FeedProvider>
                </P2PProvider>
              </SocialProvider>
            </RelayProvider>
          </TransportProvider>
        </NostrProvider>
      </AuthProvider>
    </SettingsProvider>
  );
}
