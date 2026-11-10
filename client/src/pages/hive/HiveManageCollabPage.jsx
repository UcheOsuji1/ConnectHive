import { useState, useEffect, useCallback, useRef } from 'react';
import { useOutletContext, useNavigate, Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { EXPERIENCE_LEVELS } from '../../data/collabVocabulary.js';
import RoleBuilder from '../../components/deep-dive/RoleBuilder.jsx';
import ProjectDetailsFields from '../../components/collab/ProjectDetailsFields.jsx';
import ProfessionalAudienceFields from '../../components/collab/ProfessionalAudienceFields.jsx';
import '../../styles/hive-workspace.css';
import '../../styles/category-deep-dive.css';
import '../../styles/create-hive.css';

const PROJECT_CATEGORY = 'Project Collaboration';
const PROFESSIONAL_CATEGORY = 'Professional Networking';

const PROJECT_BASIC_KEYS = [
  'project_types', 'project_types_other', 'project_stage', 'compensation',
  'funding', 'commitment', 'work_style', 'project_timeline', 'project_industries',
];
const PROFESSIONAL_BASIC_KEYS = ['audience_scope', 'pro_industries', 'career_stages'];

function pick(obj, keys) {
  const out = {};
  for (const k of keys) out[k] = obj[k];
  return out;
}

// Server role -> RoleBuilder's internal shape.
function roleFromServer(r) {
  return {
    role_id: r.role_id, title: r.title, slots: r.slots, skills: r.skills, status: r.status,
    experience: r.experience_level
      ? (EXPERIENCE_LEVELS.find(l => l.key === r.experience_level)?.label ?? 'Any level')
      : 'Any level',
  };
}
// RoleBuilder's internal shape -> PUT /collab payload shape.
function roleToPayload(r) {
  return {
    ...(r.role_id ? { role_id: r.role_id } : {}),
    title: r.title, slots: r.slots, skills: r.skills,
    experience_level: r.experience === 'Any level' ? null : r.experience,
    status: r.status === 'closed' ? 'closed' : 'open',
  };
}

function classifyError(msg) {
  if (/offer collaborators/.test(msg ?? '')) return 'compensation';
  if (/room for .* more member/.test(msg ?? '')) return 'capacity';
  if (/Pick at least one industry/.test(msg ?? '')) return 'industries';
  return 'banner';
}

function closedRolesNote(closedTitles) {
  if (!closedTitles.length) return null;
  const list = closedTitles.length <= 1
    ? closedTitles[0]
    : `${closedTitles.slice(0, -1).join(', ')} and ${closedTitles[closedTitles.length - 1]}`;
  const isAre = closedTitles.length === 1 ? 'is' : 'are';
  const itThey = closedTitles.length === 1 ? "it doesn't" : "they don't";
  return `${list} ${isAre} closed, so ${itThey} count.`;
}

export default function HiveManageCollabPage() {
  const { hive, hiveId, isOwner } = useOutletContext();
  const navigate = useNavigate();
  const isProject = hive.category_name === PROJECT_CATEGORY;
  const isProfessional = hive.category_name === PROFESSIONAL_CATEGORY;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [basics, setBasics] = useState(null);
  const [roles, setRoles] = useState([]);
  const [filledMap, setFilledMap] = useState({});
  const [membersMap, setMembersMap] = useState({});
  const [allRolesFilled, setAllRolesFilled] = useState(false);
  const [saved, setSaved] = useState(null); // { basics, roles } snapshot for dirty-check + Discard
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const [leaveTarget, setLeaveTarget] = useState(null);

  const basicKeys = isProject ? PROJECT_BASIC_KEYS : PROFESSIONAL_BASIC_KEYS;

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    api.get(`/api/hives/${hiveId}/collab`)
      .then(d => {
        const b = pick(d, basicKeys);
        const r = (d.roles ?? []).map(roleFromServer);
        const fm = {}, mm = {};
        for (const role of d.roles ?? []) { fm[role.role_id] = role.filled; mm[role.role_id] = role.members ?? []; }
        setBasics(b);
        setRoles(r);
        setFilledMap(fm);
        setMembersMap(mm);
        setAllRolesFilled(!!d.allRolesFilled);
        setSaved({ basics: b, roles: r });
      })
      .catch(e => setLoadError(e?.data?.error ?? 'Could not load this Hive\'s collab info.'))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiveId]);

  useEffect(() => { if (isOwner && (isProject || isProfessional)) load(); else setLoading(false); }, [load, isOwner, isProject, isProfessional]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const isDirty = !!saved && (
    JSON.stringify(basics) !== JSON.stringify(saved.basics) ||
    JSON.stringify(roles) !== JSON.stringify(saved.roles)
  );
  const isDirtyRef = useRef(false);
  useEffect(() => { isDirtyRef.current = isDirty; }, [isDirty]);

  // In-page "unsaved changes" prompt for in-app navigation — no browser
  // confirm() dialog. Intercepts internal <a> clicks (the sidebar's NavLinks)
  // while dirty; an actual tab close/refresh is unaffected.
  useEffect(() => {
    const onClick = (e) => {
      if (!isDirtyRef.current) return;
      const a = e.target.closest?.('a[href]');
      if (!a) return;
      const href = a.getAttribute('href');
      if (!href || /^(https?:)?\/\//.test(href) || href.startsWith('#')) return;
      e.preventDefault();
      e.stopPropagation();
      setLeaveTarget(href);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  function flash(msg) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }

  function discard() {
    if (!saved) return;
    setBasics(saved.basics);
    setRoles(saved.roles);
    setFieldErrors({});
  }

  async function save() {
    setSaving(true);
    setFieldErrors({});
    try {
      const body = isProject ? { ...basics, roles: roles.map(roleToPayload) } : { ...basics };
      const d = await api.put(`/api/hives/${hiveId}/collab`, body);
      const b = pick(d, basicKeys);
      const r = (d.roles ?? []).map(roleFromServer);
      const fm = {}, mm = {};
      for (const role of d.roles ?? []) { fm[role.role_id] = role.filled; mm[role.role_id] = role.members ?? []; }
      setBasics(b); setRoles(r); setFilledMap(fm); setMembersMap(mm);
      setAllRolesFilled(!!d.allRolesFilled);
      setSaved({ basics: b, roles: r });
      flash('Changes saved.');
    } catch (e) {
      const msg = e?.data?.error ?? 'Save failed. Try again.';
      setFieldErrors({ [classifyError(msg)]: msg });
    } finally {
      setSaving(false);
    }
  }

  if (!isOwner) {
    return (
      <div className="hw-settings">
        <div className="hw-overview-header">
          <h2 className="hw-overview-title">{isProfessional ? "Who It's For" : 'Project & Open Roles'}</h2>
          <p className="hw-overview-sub">Only owners and admins can view this.</p>
        </div>
        <Link to={`/hive/${hiveId}`} className="hw-action-link">← Back to Hive</Link>
      </div>
    );
  }

  if (!isProject && !isProfessional) {
    return (
      <div className="hw-settings">
        <div className="hw-overview-header">
          <h2 className="hw-overview-title">Not available</h2>
          <p className="hw-overview-sub">This page is only for Project Collaboration and Professional Networking Hives.</p>
        </div>
        <Link to={`/hive/${hiveId}`} className="hw-action-link">← Back to Hive</Link>
      </div>
    );
  }

  if (loading || !basics) {
    return <div className="hw-settings"><p className="hw-overview-sub">Loading…</p></div>;
  }
  if (loadError) {
    return <div className="hw-settings"><p className="ch-field-error">{loadError}</p></div>;
  }

  const openRoles = roles.filter(r => (r.status ?? 'open') === 'open');
  const openRolesCount = openRoles.length;
  const openSpotsTotal = openRoles.reduce((sum, r) => sum + Math.max(0, r.slots - (r.role_id ? (filledMap[r.role_id] ?? 0) : 0)), 0);
  const filledTotal = roles.reduce((sum, r) => sum + (r.role_id ? (filledMap[r.role_id] ?? 0) : 0), 0);
  const slotsTotal = roles.reduce((sum, r) => sum + r.slots, 0);
  const closedTitles = roles.filter(r => r.status === 'closed').map(r => r.title);

  return (
    <div className="hw-settings">
      {isProject ? (
        <>
          <div className="hw-overview-header">
            <h2 className="mg-title">Project &amp; Open Roles</h2>
            <p className="mg-sub">Only owners and admins can see this. Professional Hives get &quot;Who it&apos;s for&quot; here instead.</p>
          </div>

          <div className="stats">
            <div className="stat">
              <div className="stat-num">{openSpotsTotal}</div>
              <div className="stat-lbl">Open spots across {openRolesCount} open role{openRolesCount === 1 ? '' : 's'}</div>
            </div>
            <div className="stat">
              <div className="stat-num">{filledTotal} of {slotsTotal}</div>
              <div className="stat-lbl">Spots filled</div>
            </div>
            <div className="stat">
              <div className="stat-num">{allRolesFilled ? 'Hidden' : 'Visible'}</div>
              <div className="stat-lbl">{allRolesFilled ? 'Every role is filled' : 'In discovery while any role has an open spot'}</div>
            </div>
          </div>

          <div className={`notice ${allRolesFilled ? 'notice-warn' : 'notice-info'}`}>
            <div>
              {allRolesFilled ? (
                <><b>Every role is filled, so your Hive is hidden from discovery.</b> Members, followers, your link and code keep working. Add a role or add spots to show it again.</>
              ) : (
                <><b>When every role is filled, your Hive is hidden from discovery.</b> Members, followers, your link and code keep working. Add a role or add spots to show it again.</>
              )}
            </div>
          </div>

          <div className="ch-section">
            <ProjectDetailsFields
              value={basics}
              onChange={setBasics}
              compensationError={fieldErrors.compensation}
              roleBuilderSlot={
                <>
                  <RoleBuilder
                    value={roles}
                    onChange={setRoles}
                    projectTypes={basics.project_types}
                    filled={filledMap}
                    members={membersMap}
                    onStatusChange={(role, status) => setRoles(prev => prev.map(r => r.role_id === role.role_id ? { ...r, status } : r))}
                    minSlotsFor={(role) => Math.max(1, role.role_id ? (filledMap[role.role_id] ?? 0) : 0)}
                  />
                  {fieldErrors.capacity && <div className="notice notice-warn" role="alert"><div>{fieldErrors.capacity}</div></div>}
                  <div className="spots-total">
                    <span>Open spots: <b>{openSpotsTotal}</b> · Filled: <b>{filledTotal}</b> of {slotsTotal}</span>
                    {closedTitles.length > 0 && <span>{closedRolesNote(closedTitles)}</span>}
                  </div>
                </>
              }
            />
          </div>
        </>
      ) : (
        <>
          <div className="hw-overview-header">
            <h2 className="mg-title">Who It&apos;s For</h2>
            <p className="mg-sub">Only owners and admins can see this.</p>
          </div>
          <div className="ch-section">
            <ProfessionalAudienceFields
              value={basics}
              onChange={setBasics}
              industriesError={fieldErrors.industries}
            />
          </div>
        </>
      )}

      {fieldErrors.banner && <p className="ch-field-error">{fieldErrors.banner}</p>}
      {toast && <div className="hw-settings-success" role="status">{toast}</div>}

      <div className="save-row">
        <button type="button" className="btn-ghost" onClick={discard} disabled={!isDirty || saving}>Discard changes</button>
        <button type="button" className="ch-btn-launch" onClick={save} disabled={!isDirty || saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      {leaveTarget && (
        <div className="role-remove-confirm" style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 50, boxShadow: '0 4px 20px rgba(0,0,0,.15)' }}>
          <span>You have unsaved changes. Leave without saving?</span>
          <button type="button" onClick={() => setLeaveTarget(null)}>Stay</button>
          <button type="button" className="role-remove-confirm-danger" onClick={() => { const href = leaveTarget; setLeaveTarget(null); navigate(href); }}>Leave</button>
        </div>
      )}
    </div>
  );
}
