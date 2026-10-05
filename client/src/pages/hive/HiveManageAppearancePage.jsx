import { useState } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import '../../styles/hive-workspace.css';

// Cover, logo, tagline and pinned goal (spec §10) — the same fields the
// identity rail and Settings already edit separately, gathered in one place.
export default function HiveManageAppearancePage() {
  const {
    hive, hiveId, isOwner, refreshHive,
    onEditCover, onEditLogo, uploading, uploadError,
  } = useOutletContext();

  const [tagline, setTagline] = useState(hive.tagline ?? '');
  const [pinnedGoal, setPinnedGoal] = useState(hive.pinned_goal ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  if (!isOwner) {
    return (
      <div className="hw-settings">
        <div className="hw-overview-header">
          <h2 className="hw-overview-title">Appearance</h2>
          <p className="hw-overview-sub">Only owners and admins can view this.</p>
        </div>
        <Link to={`/hive/${hiveId}`} className="hw-action-link">← Back to Hive</Link>
      </div>
    );
  }

  async function handleSave(e) {
    e.preventDefault();
    const t = tagline.trim();
    if (t && (t.length < 1 || t.length > 90)) return setError('Tagline must be 1–90 characters.');
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const result = await api.patch(`/api/hives/${hiveId}`, {
        tagline: t || null,
        pinned_goal: pinnedGoal.trim() || null,
      });
      refreshHive(result.hive);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch (err) {
      setError(err.data?.error ?? 'Save failed. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="hw-settings">
      <div className="hw-overview-header">
        <h2 className="hw-overview-title">Appearance</h2>
        <p className="hw-overview-sub">Cover, logo, tagline and pinned goal — what members see first.</p>
      </div>

      <div className="hw-settings-card">
        <div className="hw-card-label">Cover Image</div>
        <div style={{
          height: 140, borderRadius: 10, backgroundSize: 'cover', backgroundPosition: 'center',
          backgroundColor: '#241a08',
          backgroundImage: hive.banner_url ? `url(${hive.banner_url})` : undefined,
          display: 'flex', alignItems: 'flex-end', padding: 10,
        }}>
          <button type="button" className="hw-leave-cancel-btn" onClick={onEditCover} disabled={uploading !== null}>
            {uploading === 'banner' ? 'Uploading…' : 'Change cover'}
          </button>
        </div>

        <div className="hw-card-label" style={{ marginTop: 14 }}>Logo</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14, backgroundSize: 'cover', backgroundPosition: 'center',
            backgroundColor: '#241a08', flexShrink: 0,
            backgroundImage: hive.logo_url ? `url(${hive.logo_url})` : undefined,
          }} />
          <button type="button" className="hw-leave-cancel-btn" onClick={onEditLogo} disabled={uploading !== null}>
            {uploading === 'logo' ? 'Uploading…' : 'Change logo'}
          </button>
        </div>
        {uploadError && <div className="hw-settings-error">{uploadError}</div>}
      </div>

      <form className="hw-settings-form" onSubmit={handleSave}>
        <div className="hw-settings-card">
          <div className="hw-settings-field">
            <div className="hw-settings-field-head">
              <label className="hw-settings-label">Tagline</label>
              <span className={['hw-settings-charcount', tagline.length > 90 ? 'hw-settings-charcount--over' : ''].filter(Boolean).join(' ')}>
                {tagline.length}/90
              </span>
            </div>
            <div className="hw-settings-hint">One line under your Hive's name</div>
            <input type="text" className="hw-settings-input" value={tagline} maxLength={90}
                   onChange={e => setTagline(e.target.value)} placeholder="A short line that captures your Hive" />
          </div>

          <div className="hw-settings-field">
            <label className="hw-settings-label">Pinned Goal</label>
            <div className="hw-settings-hint">Shown on Hive Home</div>
            <textarea className="hw-settings-textarea" rows={2} value={pinnedGoal}
                      onChange={e => setPinnedGoal(e.target.value)}
                      placeholder="What is this Hive working toward?" />
          </div>
        </div>

        <div className="hw-settings-footer">
          {error && <div className="hw-settings-error">{error}</div>}
          {success && <div className="hw-settings-success">Changes saved.</div>}
          <button type="submit" className="hw-settings-save-btn" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
