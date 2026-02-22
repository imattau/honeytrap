import React, { useEffect, useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import type { ProfileMetadata } from '../nostr/types';
import { useAppState } from './AppState';
import { PageHeader } from './PageHeader';
import { FormGroup } from './FormGroup';
import { EmptyState } from './EmptyState';

export function ProfileEditView() {
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
    return (
      <div className="profile-edit-view">
        <PageHeader
          title="Edit profile"
          subtitle="Publish kind 0 metadata to your relays."
          className="profile-edit-header"
        />
        <EmptyState
          title="Sign in required"
          message="Sign in to edit your profile."
          icon={Save}
        />
      </div>
    );
  }

  return (
    <div className="profile-edit-view">
      <PageHeader
        title="Edit profile"
        subtitle="Publish kind 0 metadata to your relays."
        className="profile-edit-header"
      />

      <div className="profile-edit-form">
        <FormGroup
          label="Display name"
          value={form.display_name ?? ''}
          onChange={(val) => setForm((prev) => ({ ...prev, display_name: val }))}
        />

        <FormGroup
          label="Name"
          value={form.name ?? ''}
          onChange={(val) => setForm((prev) => ({ ...prev, name: val }))}
        />

        <FormGroup
          label="Bio"
          type="textarea"
          value={form.about ?? ''}
          onChange={(val) => setForm((prev) => ({ ...prev, about: val }))}
        />

        <FormGroup
          label="Avatar URL"
          type="url"
          value={form.picture ?? ''}
          onChange={(val) => setForm((prev) => ({ ...prev, picture: val }))}
        />

        <FormGroup
          label="Banner URL"
          type="url"
          value={form.banner ?? ''}
          onChange={(val) => setForm((prev) => ({ ...prev, banner: val }))}
        />

        <FormGroup
          label="Website"
          type="url"
          value={form.website ?? ''}
          onChange={(val) => setForm((prev) => ({ ...prev, website: val }))}
        />

        <FormGroup
          label="NIP-05"
          value={form.nip05 ?? ''}
          onChange={(val) => setForm((prev) => ({ ...prev, nip05: val }))}
        />

        <FormGroup
          label="Lightning address (lud16)"
          value={form.lud16 ?? ''}
          onChange={(val) => setForm((prev) => ({ ...prev, lud16: val }))}
        />

        <button
          type="button"
          className="search-button"
          onClick={() => save().catch(() => null)}
          disabled={!canSave}
        >
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
