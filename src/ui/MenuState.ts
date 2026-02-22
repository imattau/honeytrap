import type { AppSettings, P2PSettings } from '../storage/types';

interface MenuStateData {
  relaysInput: string;
  mediaRelaysInput: string;
  mutedWordsInput: string;
  mutedHashtagsInput: string;
  torrent: P2PSettings;
  walletLnurl: string;
  walletPresetsInput: string;
  walletNwc: string;
}

export class MenuState {
  private constructor(private data: MenuStateData) {}

  static fromSettings(settings: AppSettings): MenuState {
    return new MenuState({
      relaysInput: settings.relays.join('\n'),
      mediaRelaysInput: settings.mediaRelays.join('\n'),
      mutedWordsInput: settings.mutedWords.join('\n'),
      mutedHashtagsInput: settings.mutedHashtags.map((tag) => `#${tag}`).join('\n'),
      torrent: { ...settings.p2p },
      walletLnurl: settings.wallet?.lnurl ?? '',
      walletPresetsInput: (settings.wallet?.presets ?? []).join(', '),
      walletNwc: settings.wallet?.nwc ?? ''
    });
  }

  get relaysInput() {
    return this.data.relaysInput;
  }

  get mediaRelaysInput() {
    return this.data.mediaRelaysInput;
  }

  get mutedWordsInput() {
    return this.data.mutedWordsInput;
  }

  get mutedHashtagsInput() {
    return this.data.mutedHashtagsInput;
  }

  get torrent() {
    return this.data.torrent;
  }

  get walletLnurl() {
    return this.data.walletLnurl;
  }

  get walletPresetsInput() {
    return this.data.walletPresetsInput;
  }

  get walletNwc() {
    return this.data.walletNwc;
  }

  withRelaysInput(input: string): MenuState {
    return new MenuState({ ...this.data, relaysInput: input });
  }

  withMediaRelaysInput(input: string): MenuState {
    return new MenuState({ ...this.data, mediaRelaysInput: input });
  }

  withMutedWordsInput(input: string): MenuState {
    return new MenuState({ ...this.data, mutedWordsInput: input });
  }

  withMutedHashtagsInput(input: string): MenuState {
    return new MenuState({ ...this.data, mutedHashtagsInput: input });
  }

  withTorrentPatch(patch: Partial<P2PSettings>): MenuState {
    return new MenuState({ ...this.data, torrent: { ...this.data.torrent, ...patch } });
  }

  withWalletLnurl(input: string): MenuState {
    return new MenuState({ ...this.data, walletLnurl: input });
  }

  withWalletPresetsInput(input: string): MenuState {
    return new MenuState({ ...this.data, walletPresetsInput: input });
  }

  withWalletNwc(input: string): MenuState {
    return new MenuState({ ...this.data, walletNwc: input });
  }

  applyRelays(settings: AppSettings): AppSettings {
    return { ...settings, relays: parseList(this.data.relaysInput) };
  }

  applyMediaRelays(settings: AppSettings): AppSettings {
    return { ...settings, mediaRelays: parseList(this.data.mediaRelaysInput) };
  }

  applyMuted(settings: AppSettings): AppSettings {
    return {
      ...settings,
      mutedWords: parseMutedWords(this.data.mutedWordsInput),
      mutedHashtags: parseMutedHashtags(this.data.mutedHashtagsInput)
    };
  }

  applyTorrent(settings: AppSettings): AppSettings {
    return { ...settings, p2p: { ...this.data.torrent } };
  }

  applyWallet(settings: AppSettings): AppSettings {
    return {
      ...settings,
      wallet: {
        lnurl: this.data.walletLnurl.trim(),
        presets: parseNumbers(this.data.walletPresetsInput),
        nwc: this.data.walletNwc.trim()
      }
    };
  }
}

function parseList(input: string): string[] {
  return input
    .split(/\n|,/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseNumbers(input: string): number[] {
  const values = input
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);
  return values.length > 0 ? values : [];
}

function parseMutedWords(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/\n|,/)
        .map((term) => term.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

function parseMutedHashtags(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/\n|,/)
        .map((term) => term.trim().toLowerCase().replace(/^#/, ''))
        .filter(Boolean)
    )
  );
}
