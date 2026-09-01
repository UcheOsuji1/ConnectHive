import { useState } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';

export default function HiveAboutPage() {
  const { hive, hiveId, isOwner } = useOutletContext();
  const navigate = useNavigate();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [leaving,     setLeaving]     = useState(false);
  const [leaveError,  setLeaveError]  = useState(null);

  async function confirmLeave() {
    setLeaving(true);
    setLeaveError(null);
    try {
      await api.post(`/api/hives/${hiveId}/leave`, {});
      navigate('/my-hive');
    } catch (err) {
      setLeaveError(err.data?.error ?? 'Could not leave. Please try again.');
      setLeaving(false);
    }
  }

  const sections = [
    { label: 'Pinned Goal',  value: hive.pinned_goal },
    { label: 'Ground Rules', value: hive.ground_rules },
    { label: 'Icebreaker',   value: hive.icebreaker },
    { label: 'Meets',        value: [hive.cadence, hive.location_type].filter(Boolean).join(' · ') || null },
  ].filter(s => s.value);

  return (
    <>
      {sections.length === 0 ? (
        <div className="hw-empty-state">
          <div className="hw-empty-title">No details added yet.</div>
        </div>
      ) : (
        <div className="hw-about-grid">
          {sections.map(s => (
            <div key={s.label} className="hw-about-card">
              <div className="hw-about-label">{s.label}</div>
              <div className="hw-about-body">{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Leave Hive — shown for non-owners only (owners use Settings) */}
      {!isOwner && (
        <div className="hw-settings-card hw-settings-danger-card" style={{ marginTop: '24px' }}>
          <div className="hw-card-label">Danger Zone</div>

          {!confirmOpen ? (
            <div className="hw-settings-danger-row">
              <div>
                <div className="hw-settings-label">Leave this Hive</div>
                <div className="hw-settings-hint">You can rejoin later if the Hive is open or re-apply if it requires approval.</div>
              </div>
              <button
                type="button"
                className="hw-settings-danger-btn"
                onClick={() => { setConfirmOpen(true); setLeaveError(null); }}
              >
                Leave Hive
              </button>
            </div>
          ) : (
            <div className="hw-leave-dialog">
              <p className="hw-leave-hint hw-leave-hint--warn">
                Are you sure you want to leave <strong>{hive.hive_name}</strong>?
              </p>
              {leaveError && <p className="hw-leave-error">{leaveError}</p>}
              <div className="hw-leave-actions">
                <button
                  type="button"
                  className="hw-leave-cancel-btn"
                  onClick={() => setConfirmOpen(false)}
                  disabled={leaving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="hw-settings-danger-btn"
                  onClick={confirmLeave}
                  disabled={leaving}
                >
                  {leaving ? 'Leaving…' : 'Confirm Leave'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
