// Shared "view mode" link-button row — used on a member's own profile and
// on other members' profiles (Prompt 83). Opens every link safely.
export default function ProfileLinkButtons({ links }) {
  if (!links?.length) return null;
  return (
    <div className="prof-links-row">
      {links.map((l, i) => {
        let domain = '';
        try { domain = new URL(l.url).hostname.replace(/^www\./, ''); } catch { /* malformed — show no domain */ }
        return (
          <a key={i} className="prof-link-btn" href={l.url} target="_blank" rel="noopener noreferrer">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M6.5 9.5l3-3M7 4.5l1.2-1.2a2.8 2.8 0 014 4L11 8.5M9 11.5l-1.2 1.2a2.8 2.8 0 01-4-4L5 7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            {l.label} <span className="prof-link-dom">{domain}</span>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M5 2H2v8h8V7M7 2h3v3M10 2L5.5 6.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          </a>
        );
      })}
    </div>
  );
}
