import React, { useEffect, useState, useRef } from 'react';
import { flushSync } from 'react-dom';
import { Bell, KeyRound, List, LogOut, PencilLine, QrCode, Search, ShieldAlert, UserCircle, X } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { useAppState } from './AppState';
import { createNostrConnectRequest, decodeKey } from '../nostr/auth';
import { MenuState } from './MenuState';
import { MediaRelaysSection } from './menu/MediaRelaysSection';
import { NostrRelaysSection } from './menu/NostrRelaysSection';
import { TorrentSection } from './menu/TorrentSection';
import { WalletSection } from './menu/WalletSection';
import { MenuSection } from './menu/MenuSection';
import { MenuPill } from './menu/MenuPill';
import { useNavigate } from 'react-router-dom';
import type { AppSettings } from '../storage/types';

export function Drawer() {
  const navigate = useNavigate();
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
    publishRelayList,
    saveP2PSettings,
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
  const [nostrConnectUri, setNostrConnectUri] = useState('');
  const [connectStatus, setConnectStatus] = useState<string | null>(null);
  const [savedSection, setSavedSection] = useState<'relays' | 'media' | 'torrent' | 'wallet' | null>(null);
  const [isWide, setIsWide] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const [menuState, setMenuState] = useState(() => buildMenuState(settings, relayList, mediaRelayList));
  const [relaysOpen, setRelaysOpen] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const touchScrollTopRef = useRef<number>(0);
  const fallbackAvatar = '/assets/honeytrap_logo_256.png';
  const headerImage = '/assets/honeytrap_header_960.png';
  const appVersion = __APP_VERSION__;

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
        relays: settings.relays,
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

  const handleSignOut = async () => {
    disconnectNip46();
    await clearKeys();
  };

  const handleSaveRelays = () => {
    const next = menuState.applyRelays(settings);
    setSettings(next);
    publishRelayList(next.relays).catch(() => null);
    setSavedSection('relays');
  };

  const handleSaveMediaRelays = () => {
    const next = menuState.applyMediaRelays(settings);
    saveMediaRelays(next.mediaRelays).catch(() => null);
    setSavedSection('media');
  };

  const handleSaveTorrent = () => {
    const next = menuState.applyTorrent(settings);
    const updatedAt = Date.now();
    const withStamp = { ...next, p2pUpdatedAt: updatedAt };
    setSettings(withStamp);
    saveP2PSettings(withStamp.p2p, updatedAt).catch(() => null);
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
      <div
        className={`top-drawer ${open ? 'open' : ''}`}
        onTouchStart={(event) => {
          if (isWide) return;
          const touch = event.touches[0];
          setTouchStart(touch?.clientY ?? null);
          touchStartXRef.current = touch?.clientX ?? null;
          touchScrollTopRef.current = (event.currentTarget as HTMLDivElement).scrollTop ?? 0;
        }}
        onTouchMove={(event) => {
          if (isWide || touchStart === null) return;
          if (touchScrollTopRef.current > 4) return;
          const touch = event.touches[0];
          const currentY = touch?.clientY ?? touchStart;
          const currentX = touch?.clientX ?? touchStartXRef.current ?? 0;
          const deltaY = currentY - touchStart;
          const deltaX = currentX - (touchStartXRef.current ?? currentX);
          if (deltaY < -120 && Math.abs(deltaX) < 40) {
            setOpen(false);
            setTouchStart(null);
          }
        }}
        onTouchEnd={(event) => {
          if (isWide || touchStart === null) return;
          if (touchScrollTopRef.current <= 4) {
            const endTouch = event.changedTouches[0];
            const endY = endTouch?.clientY ?? touchStart;
            const endX = endTouch?.clientX ?? touchStartXRef.current ?? 0;
            const deltaY = endY - touchStart;
            const deltaX = endX - (touchStartXRef.current ?? endX);
            if (deltaY < -120 && Math.abs(deltaX) < 40) setOpen(false);
          }
          setTouchStart(null);
          touchStartXRef.current = null;
        }}
      >
        {!isWide && (
          <button className="drawer-close" onClick={() => setOpen(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        )}
        <div className="menu-banner">
          <img src={headerImage} alt="Honeytrap" />
        </div>
        <div className="drawer-version">v{appVersion}</div>
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
                <div
                  className="drawer-author"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (!keys?.npub) return;
                    flushSync(() => navigate(`/author/${keys.npub}`));
                    if (!isWide) setOpen(false);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      if (keys?.npub) flushSync(() => navigate(`/author/${keys.npub}`));
                      if (!isWide) setOpen(false);
                    }
                  }}
                >
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
              <div className="menu-row">
                <button type="button" className="menu-button" onClick={() => {
                  flushSync(() => navigate('/search'));
                  if (!isWide) setOpen(false);
                }}>
                  <Search size={14} /> Search
                </button>
                <button type="button" className="menu-button" onClick={() => {
                  flushSync(() => navigate('/notifications'));
                  if (!isWide) setOpen(false);
                }}>
                  <Bell size={14} /> Notifications
                </button>
                <button type="button" className="menu-button" onClick={() => {
                  flushSync(() => navigate('/lists'));
                  if (!isWide) setOpen(false);
                }}>
                  <List size={14} /> Lists
                </button>
                <button type="button" className="menu-button" onClick={() => {
                  flushSync(() => navigate('/profile/edit'));
                  if (!isWide) setOpen(false);
                }}>
                  <PencilLine size={14} /> Edit profile
                </button>
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
            <button className="menu-button danger" onClick={handleSignOut}>
              <LogOut size={14} /> Sign out
            </button>
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
