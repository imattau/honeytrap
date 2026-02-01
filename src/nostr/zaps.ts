import type { NostrEvent, ProfileMetadata } from './types';
import type { EventSigner } from './signer';
import { NwcClient } from './nwc';
import type { ZapServiceApi } from './contracts';

export interface ZapRequestInput {
  targetEvent: NostrEvent;
  recipientPubkey: string;
  relays: string[];
  amountSats: number;
  comment?: string;
  signer: EventSigner;
  lud16?: string;
  lud06?: string;
}

export async function requestZapInvoice({
  targetEvent,
  recipientPubkey,
  relays,
  amountSats,
  comment,
  signer,
  lud16,
  lud06
}: ZapRequestInput): Promise<string> {
  const lnurl = lud06 ?? (lud16 ? lnurlFromLud16(lud16) : undefined);
  if (!lnurl) throw new Error('No LNURL available for recipient');

  const lnurlResponse = await fetch(lnurl).then((res) => res.json());
  if (!lnurlResponse.callback) throw new Error('LNURL callback missing');

  const zapRequest = await signer.signEvent({
    kind: 9734,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['p', recipientPubkey],
      ['e', targetEvent.id],
      ['relays', ...relays]
    ],
    content: comment ?? ''
  });

  const params = new URLSearchParams({
    amount: String(amountSats * 1000),
    nostr: JSON.stringify(zapRequest)
  });
  const callbackUrl = `${lnurlResponse.callback}?${params.toString()}`;
  const invoiceResponse = await fetch(callbackUrl).then((res) => res.json());
  if (!invoiceResponse.pr) throw new Error('Invoice missing');
  return invoiceResponse.pr as string;
}

function lnurlFromLud16(lud16: string): string {
  const [name, domain] = lud16.split('@');
  return `https://${domain}/.well-known/lnurlp/${name}`;
}

export class ZapService implements ZapServiceApi {
  constructor(private signer: EventSigner) {}

  async sendZap({
    targetEvent,
    recipientProfile,
    relays,
    amountSats,
    comment,
    nwcUri
  }: {
    targetEvent: NostrEvent;
    recipientProfile?: ProfileMetadata;
    relays: string[];
    amountSats: number;
    comment?: string;
    nwcUri?: string;
  }): Promise<void> {
    if (!nwcUri) throw new Error('NWC is not configured');
    const invoice = await requestZapInvoice({
      targetEvent,
      recipientPubkey: targetEvent.pubkey,
      relays,
      amountSats,
      comment,
      signer: this.signer,
      lud16: recipientProfile?.lud16,
      lud06: recipientProfile?.lud06
    });
    const connection = NwcClient.parse(nwcUri);
    const client = new NwcClient(connection);
    await client.payInvoice(invoice);
  }
}
