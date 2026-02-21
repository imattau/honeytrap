import React, { useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import type { ProfileMetadata } from '../nostr/types';
import { useAppState } from './AppState';

export function ProfileEditView() {
  const navigate = useNavigate();
  const { keys, selfProfile, publishProfile } = useAppState();
  const [form, setForm] = useState<ProfileMetadata>({});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    setForm(selfProfile ?? {});
  }, [selfProfile]);

  const canSave = useMemo(() => Boolean(keys?.npub) && !saving, [keys?.npub, saving]);

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setStatus(null);
    try {
      await publishProfile(cleanProfile(form));
      setStatus('Profile published');
    } catch {
      setStatus('Unable to publish profile');
    } finally {
      setSaving(false);
    }
  };

  if (!keys?.npub) {
    return <div className="author-empty">Sign in to edit your profile.</div>;
  }

  return (
    <div className="profile-edit-view">
      <div className="profile-edit-header">
        <button className="author-back" onClick={() => {
          const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
          if (idx > 0) flushSync(() => navigate(-1));
          else flushSync(() => navigate('/'));
        }} aria-label="Back">
          <ArrowLeft size={18} />
        </button>
        <div>
          <div className="search-title">Edit profile</div>
          <div className="search-sub">Publish kind 0 metadata to your relays.</div>
        </div>
      </div>

      <div className="profile-edit-form">
        <label className="search-label">Display name</label>
        <input className="search-input" value={form.display_name ?? ''} onChange={(event) => setForm((prev) => ({ ...prev, display_name: event.target.value }))} />

        <label className="search-label">Name</label>
        <input className="search-input" value={form.name ?? ''} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />

        <label className="search-label">Bio</label>
        <textarea className="profile-edit-textarea" value={form.about ?? ''} onChange={(event) => setForm((prev) => ({ ...prev, about: event.target.value }))} />

        <label className="search-label">Avatar URL</label>
        <input className="search-input" value={form.picture ?? ''} onChange={(event) => setForm((prev) => ({ ...prev, picture: event.target.value }))} />

        <label className="search-label">Banner URL</label>
        <input className="search-input" value={form.banner ?? ''} onChange={(event) => setForm((prev) => ({ ...prev, banner: event.target.value }))} />

        <label className="search-label">Website</label>
        <input className="search-input" value={form.website ?? ''} onChange={(event) => setForm((prev) => ({ ...prev, website: event.target.value }))} />

        <label className="search-label">NIP-05</label>
        <input className="search-input" value={form.nip05 ?? ''} onChange={(event) => setForm((prev) => ({ ...prev, nip05: event.target.value }))} />

        <label className="search-label">Lightning address (lud16)</label>
        <input className="search-input" value={form.lud16 ?? ''} onChange={(event) => setForm((prev) => ({ ...prev, lud16: event.target.value }))} />

        <button className="search-button" onClick={() => save().catch(() => null)} disabled={!canSave}>
          <Save size={16} /> {saving ? 'Publishing…' : 'Publish profile'}
        </button>
        {status && <div className="search-sub">{status}</div>}
      </div>
    </div>
  );
}

function cleanProfile(profile: ProfileMetadata): ProfileMetadata {
  const next: ProfileMetadata = {};
  for (const [key, value] of Object.entries(profile)) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    next[key as keyof ProfileMetadata] = trimmed;
  }
  return next;
}
