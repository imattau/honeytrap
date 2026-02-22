import React, { useEffect, useMemo, useState } from 'react';
import { ListPlus, Users } from 'lucide-react';
import { decodeKey } from '../nostr/auth';
import type { ListDescriptor } from '../nostr/types';
import { useAppState } from './AppState';
import { PageHeader } from './PageHeader';
import { FormGroup } from './FormGroup';
import { EmptyState } from './EmptyState';

export function ListsView() {
  const { keys, fetchLists, publishPeopleList } = useAppState();
  const [lists, setLists] = useState<ListDescriptor[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [pubkeysInput, setPubkeysInput] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canCreate = useMemo(() => title.trim().length > 0 && pubkeysInput.trim().length > 0 && !saving, [pubkeysInput, saving, title]);

  const loadLists = async () => {
    if (!keys?.npub) {
      setLists([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const loaded = await fetchLists(keys.npub);
      setLists(loaded.sort((a, b) => a.title.localeCompare(b.title)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLists().catch(() => null);
  }, [keys?.npub]);

  const createList = async () => {
    if (!canCreate) return;
    setSaving(true);
    setStatus(null);
    try {
      const pubkeys = parsePubkeys(pubkeysInput);
      if (pubkeys.length === 0) {
        setStatus('No valid pubkeys found.');
        return;
      }
      await publishPeopleList({
        title: title.trim(),
        description: description.trim() || undefined,
        pubkeys
      });
      setStatus('List published.');
      setTitle('');
      setDescription('');
      setPubkeysInput('');
      await loadLists();
    } catch {
      setStatus('Unable to publish list.');
    } finally {
      setSaving(false);
    }
  };

  if (!keys?.npub) {
    return (
      <div className="lists-view">
        <PageHeader
          title="Lists"
          subtitle="View your NIP-51 lists and publish a new people list."
          icon={<Users size={18} />}
          className="search-header"
        />
        <EmptyState
          title="Sign in required"
          message="Sign in to view and publish NIP-51 lists."
          icon={Users}
        />
      </div>
    );
  }

  return (
    <div className="lists-view">
      <PageHeader
        title="Lists"
        subtitle="View your NIP-51 lists and publish a new people list."
        icon={<Users size={18} />}
        className="search-header"
      />

      <div className="profile-edit-form">
        <FormGroup
          label="List title"
          value={title}
          onChange={setTitle}
        />

        <FormGroup
          label="Description"
          value={description}
          onChange={setDescription}
        />

        <FormGroup
          label="Pubkeys / npubs (one per line)"
          type="textarea"
          value={pubkeysInput}
          onChange={setPubkeysInput}
        />

        <button
          type="button"
          className="search-button"
          onClick={() => createList().catch(() => null)}
          disabled={!canCreate}
        >
          <ListPlus size={16} /> {saving ? 'Publishing…' : 'Publish list'}
        </button>
        {status && <div className="search-sub">{status}</div>}
      </div>

      <div className="search-results">
        <div className="search-section-title">Existing lists</div>
        {loading && (
          <EmptyState
            title="Loading lists…"
            loading={true}
          />
        )}
        {!loading && lists.length === 0 && (
          <EmptyState
            title="No lists found"
            message="You haven't created any NIP-51 people lists yet."
            icon={Users}
          />
        )}
        {lists.map((list) => (
          <div key={list.id} className="search-result static">
            <Users size={16} />
            <div>
              <div className="search-result-title">{list.title}</div>
              <div className="search-result-sub">Kind {list.kind} - {list.pubkeys.length} members</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function parsePubkeys(input: string): string[] {
  const out = new Set<string>();
  input
    .split(/\n|,|\s/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((value) => {
      if (/^[a-f0-9]{64}$/i.test(value)) {
        out.add(value.toLowerCase());
        return;
      }
      if (value.startsWith('npub')) {
        try {
          out.add(decodeKey(value).npub);
        } catch {
          // ignore invalid npub
        }
      }
    });
  return Array.from(out);
}
