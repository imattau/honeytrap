import React, { useEffect, useState } from 'react';
import { KeyRound, QrCode, ShieldAlert, UserCircle, X } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { useAppState } from './AppState';
import { decodeKey } from '../nostr/auth';
import { MenuState } from './MenuState';
import { MediaRelaysSection } from './menu/MediaRelaysSection';
import { NostrRelaysSection } from './menu/NostrRelaysSection';
import { TorrentSection } from './menu/TorrentSection';
import { WalletSection } from './menu/WalletSection';
import { SignOutSection } from './menu/SignOutSection';
import { MenuSection } from './menu/MenuSection';
import { MenuPill } from './menu/MenuPill';
import type { AppSettings } from '../storage/types';

export function Drawer() {
  const {
    settings,
    setSettings,
    keys,
    selfProfile,
    followers,
    relayList,
    mediaRelayList,
    relayStatus,
    refreshRelayStatus,
    saveMediaRelays,
    saveKeyRecord,
    clearKeys,
    connectNip07,
    connectNip46,
    disconnectNip46,
    setFeedMode
  } = useAppState();
  const [open, setOpen] = useState(false);
  const [nsecInput, setNsecInput] = useState('');
  const [bunkerInput, setBunkerInput] = useState('');
  const [bunkerQr, setBunkerQr] = useState('');
  const [connectStatus, setConnectStatus] = useState<string | null>(null);
  const [savedSection, setSavedSection] = useState<'relays' | 'media' | 'torrent' | 'wallet' | null>(null);
  const [isWide, setIsWide] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const [menuState, setMenuState] = useState(() => buildMenuState(settings, relayList, mediaRelayList));
  const [relaysOpen, setRelaysOpen] = useState(false);
  const fallbackAvatar = '/assets/honeytrap_logo_256.png';
  const headerImage = '/assets/honeytrap_header_960.png';

  useEffect(() => {
    setMenuState(buildMenuState(settings, relayList, mediaRelayList));
  }, [settings, relayList, mediaRelayList]);

  useEffect(() => {
    if (!relaysOpen) return;
    refreshRelayStatus();
    const timer = window.setInterval(() => refreshRelayStatus(), 2000);
    return () => window.clearInterval(timer);
  }, [relaysOpen, refreshRelayStatus]);

  useEffect(() => {
    if (!savedSection) return;
    const timer = window.setTimeout(() => setSavedSection(null), 900);
    return () => window.clearTimeout(timer);
  }, [savedSection]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const update = () => {
      setIsWide(mq.matches);
      if (mq.matches) setOpen(true);
    };
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    const update = () => setIsTouch(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const isAuthed = Boolean(keys?.npub);

  const handleNsecSave = async () => {
    if (!nsecInput.trim()) return;
    const decoded = decodeKey(nsecInput.trim());
    await saveKeyRecord({ npub: decoded.npub, nsec: decoded.nsec });
    setNsecInput('');
  };

  const handleNip07 = async () => {
    await connectNip07();
  };

  const handleBunkerConnect = async () => {
    if (!bunkerInput.trim()) return;
    setConnectStatus('Connecting...');
    try {
      const pubkey = await connectNip46(bunkerInput.trim(), (authUrl) => {
        setConnectStatus(`Approve in bunker: ${authUrl}`);
      });
      setConnectStatus(`Connected as ${pubkey.slice(0, 10)}…`);
    } catch (error) {
      setConnectStatus(error instanceof Error ? error.message : 'Failed to connect');
    }
  };

  const handleBunkerQr = () => {
    setBunkerQr(bunkerInput.trim());
  };

  const handleSignOut = async () => {
    disconnectNip46();
    await clearKeys();
  };

  const handleSaveRelays = () => {
    setSettings(menuState.applyRelays(settings));
    setSavedSection('relays');
  };

  const handleSaveMediaRelays = () => {
    const next = menuState.applyMediaRelays(settings);
    saveMediaRelays(next.mediaRelays).catch(() => null);
    setSavedSection('media');
  };

  const handleSaveTorrent = () => {
    setSettings(menuState.applyTorrent(settings));
    setSavedSection('torrent');
  };

  const handleSaveWallet = () => {
    setSettings(menuState.applyWallet(settings));
    setSavedSection('wallet');
  };

  return (
    <>
      {!isWide && (
        <button className="top-handle" onClick={() => setOpen((prev) => !prev)}>
          <span className="top-handle-pill" />
          <span className="top-handle-label">Menu</span>
        </button>
      )}
      {open && !isWide && <div className="drawer-backdrop" onClick={() => setOpen(false)} />}
      <div className={`top-drawer ${open ? 'open' : ''}`}>
        {!isWide && (
          <button className="drawer-close" onClick={() => setOpen(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        )}
        <div className="menu-banner">
          <img src={headerImage} alt="Honeytrap" />
        </div>
        {!isAuthed ? (
          <MenuSection title="Sign in" icon={<KeyRound size={16} />} collapsible={false}>
              {!isTouch && (
                <button className="menu-button" onClick={handleNip07}>
                  NIP-07 Extension
                </button>
              )}
              <label className="menu-label"><QrCode size={14} /> NIP-46 / Bunker</label>
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
              </div>
              {connectStatus && <div className="menu-sub">{connectStatus}</div>}
              {bunkerQr && (
                <div className="drawer-qr">
                  <QRCodeCanvas value={bunkerQr} size={164} bgColor="#0b0d10" fgColor="#e5edf7" />
                </div>
              )}
              <label className="menu-label"><ShieldAlert size={14} /> Paste nsec (unsafe)</label>
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
        ) : (
          <div className="menu-stack">
            <MenuSection title="Author" icon={<UserCircle size={16} />} collapsible={false}>
              {selfProfile ? (
                <div className="drawer-author">
                  {selfProfile.picture ? (
                    <img src={selfProfile.picture} alt="avatar" className="drawer-avatar" />
                  ) : (
                    <img src={fallbackAvatar} alt="avatar" className="drawer-avatar fallback" />
                  )}
                  <div>
                    <div className="drawer-name">{selfProfile.display_name ?? selfProfile.name ?? 'Unknown'}</div>
                    <div className="drawer-sub">{keys?.npub?.slice(0, 16)}…</div>
                  </div>
                </div>
              ) : (
                <div className="drawer-sub">Loading your profile…</div>
              )}
              <div className="menu-pill-row">
                <MenuPill
                  label="Follows"
                  count={followers.length}
                  active={settings.feedMode === 'followers' || settings.feedMode === 'both'}
                  onClick={() => {
                    if (settings.feedMode === 'followers') setFeedMode('all');
                    else if (settings.feedMode === 'both') setFeedMode('follows');
                    else if (settings.feedMode === 'follows') setFeedMode('both');
                    else setFeedMode('followers');
                  }}
                />
                <MenuPill
                  label="Following"
                  count={settings.follows.length}
                  active={settings.feedMode === 'follows' || settings.feedMode === 'both'}
                  onClick={() => {
                    if (settings.feedMode === 'follows') setFeedMode('all');
                    else if (settings.feedMode === 'both') setFeedMode('followers');
                    else if (settings.feedMode === 'followers') setFeedMode('both');
                    else setFeedMode('follows');
                  }}
                />
              </div>
            </MenuSection>

            <MediaRelaysSection
              value={menuState.mediaRelaysInput}
              onChange={(value) => setMenuState(menuState.withMediaRelaysInput(value))}
              onSave={handleSaveMediaRelays}
              saved={savedSection === 'media'}
            />
            {mediaRelayList.length > 0 && (
              <div className="menu-sub">NIP-51 media relays loaded ({mediaRelayList.length})</div>
            )}
            <NostrRelaysSection
              value={menuState.relaysInput}
              onChange={(value) => setMenuState(menuState.withRelaysInput(value))}
              onSave={handleSaveRelays}
              saved={savedSection === 'relays'}
              onToggle={setRelaysOpen}
              relayStatus={relayStatus}
            />
            {relayList.length > 0 && relaysOpen && (
              <div className="menu-sub">NIP-65 relays loaded ({relayList.length})</div>
            )}
            <TorrentSection
              value={menuState.torrent}
              onChange={(patch) => setMenuState(menuState.withTorrentPatch(patch))}
              onSave={handleSaveTorrent}
              saved={savedSection === 'torrent'}
            />
            <WalletSection
              lnurl={menuState.walletLnurl}
              presetsInput={menuState.walletPresetsInput}
              nwc={menuState.walletNwc}
              onLnurlChange={(value) => setMenuState(menuState.withWalletLnurl(value))}
              onPresetsChange={(value) => setMenuState(menuState.withWalletPresetsInput(value))}
              onNwcChange={(value) => setMenuState(menuState.withWalletNwc(value))}
              onSave={handleSaveWallet}
              saved={savedSection === 'wallet'}
            />
            <SignOutSection onSignOut={handleSignOut} />
          </div>
        )}
      </div>
    </>
  );
}

function buildMenuState(settings: AppSettings, relayList: string[], mediaRelayList: string[]) {
  const state = MenuState.fromSettings(settings);
  let next = state;
  if (relayList.length > 0) next = next.withRelaysInput(relayList.join('\n'));
  if (mediaRelayList.length > 0) next = next.withMediaRelaysInput(mediaRelayList.join('\n'));
  return next;
}
