import React, { useState } from 'react';
import { KeyRound, QrCode, ShieldAlert } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { MenuSection } from './menu/MenuSection';
import { decodeKey, createNostrConnectRequest } from '../nostr/auth';
import type { KeyRecord } from '../storage/types';

interface SignInMenuProps {
  isTouch: boolean;
  relays: string[];
  saveKeyRecord: (record: KeyRecord) => Promise<void>;
  connectNip07: () => Promise<void>;
  connectNip46: (input: string, onAuthUrl?: (url: string) => void, clientSecretKey?: Uint8Array) => Promise<string>;
}

export const SignInMenu: React.FC<SignInMenuProps> = ({
  isTouch,
  relays,
  saveKeyRecord,
  connectNip07,
  connectNip46
}) => {
  const [nsecInput, setNsecInput] = useState('');
  const [bunkerInput, setBunkerInput] = useState('');
  const [bunkerQr, setBunkerQr] = useState('');
  const [nostrConnectUri, setNostrConnectUri] = useState('');
  const [connectStatus, setConnectStatus] = useState<string | null>(null);

  const handleNsecSave = async () => {
    if (!nsecInput.trim()) return;
    try {
      const decoded = decodeKey(nsecInput.trim());
      await saveKeyRecord({ npub: decoded.npub, nsec: decoded.nsec });
      setNsecInput('');
    } catch {
      setConnectStatus('Invalid nsec');
    }
  };

  const handleNip07 = async () => {
    try {
      await connectNip07();
    } catch (error) {
      setConnectStatus(error instanceof Error ? error.message : 'Extension failed');
    }
  };

  const handleBunkerConnect = async () => {
    if (!bunkerInput.trim()) return;
    setConnectStatus('Connecting...');
    try {
      const pubkey = await connectNip46(bunkerInput.trim(), (authUrl) => {
        setConnectStatus(`Approve in bunker: ${authUrl}`);
        if (isTouch) {
          try {
            window.location.href = authUrl;
          } catch {
            // ignore
          }
        } else {
          setBunkerQr(authUrl);
        }
      });
      setConnectStatus(`Connected as ${pubkey.slice(0, 10)}…`);
    } catch (error) {
      setConnectStatus(error instanceof Error ? error.message : 'Failed to connect');
    }
  };

  const handleSignerConnect = async () => {
    setConnectStatus('Waiting for signer approval...');
    try {
      const origin = window.location.origin;
      const image = `${origin}/assets/honeytrap_logo_256.png`;
      const { uri, secretKey } = createNostrConnectRequest({
        relays,
        perms: ['sign_event', 'nip44_encrypt', 'nip44_decrypt'],
        name: 'Honeytrap',
        url: origin,
        image
      });
      setNostrConnectUri(uri);
      setBunkerQr(uri);
      if (isTouch) {
        window.location.href = uri;
      }
      const pubkey = await connectNip46(uri, (authUrl) => {
        setConnectStatus(`Approve in signer: ${authUrl}`);
        if (isTouch) {
          try {
            window.location.href = authUrl;
          } catch {
            // ignore
          }
        }
      }, secretKey);
      setConnectStatus(`Connected as ${pubkey.slice(0, 10)}…`);
    } catch (error) {
      setConnectStatus(error instanceof Error ? error.message : 'Failed to connect');
    }
  };

  const handleBunkerQr = () => {
    setBunkerQr(bunkerInput.trim());
  };

  const handleSignerApp = () => {
    const target = bunkerInput.trim();
    if (!target) return;
    try {
      window.location.href = target;
    } catch {
      // ignore
    }
  };

  return (
    <MenuSection title="Sign in" icon={<KeyRound size={16} />} collapsible={false}>
      {!isTouch && (
        <button className="menu-button" onClick={handleNip07}>
          NIP-07 Extension
        </button>
      )}
      <label className="menu-label">
        <QrCode size={14} /> NIP-46 / Bunker
      </label>
      <input
        className="menu-input"
        placeholder="bunker:// or nostrconnect://"
        value={bunkerInput}
        onChange={(event) => setBunkerInput(event.target.value)}
      />
      <div className="menu-row">
        <button className="menu-button" onClick={handleBunkerConnect}>
          Connect
        </button>
        <button className="menu-button" onClick={handleBunkerQr}>
          Show QR
        </button>
        {isTouch && (
          <button className="menu-button" onClick={handleSignerApp}>
            Open Signer App
          </button>
        )}
      </div>
      <div className="menu-sub">Or start a signer app flow:</div>
      <div className="menu-row">
        <button className="menu-button" onClick={handleSignerConnect}>
          Generate Signer Link
        </button>
        {nostrConnectUri && (
          <button className="menu-button" onClick={() => setBunkerQr(nostrConnectUri)}>
            Show Signer QR
          </button>
        )}
      </div>
      {connectStatus && <div className="menu-sub">{connectStatus}</div>}
      {bunkerQr && (
        <div className="drawer-qr">
          <QRCodeCanvas value={bunkerQr} size={164} bgColor="#0b0d10" fgColor="#e5edf7" />
        </div>
      )}
      <label className="menu-label">
        <ShieldAlert size={14} /> Paste nsec (unsafe)
      </label>
      <input
        className="menu-input"
        placeholder="nsec1..."
        value={nsecInput}
        onChange={(event) => setNsecInput(event.target.value)}
      />
      <div className="drawer-warning">Never use your primary key. Use a burner.</div>
      <button className="menu-button" onClick={handleNsecSave}>
        Save key
      </button>
    </MenuSection>
  );
};
