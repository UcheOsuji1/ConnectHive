import { useNavigate } from 'react-router-dom';

// Canonical category taxonomy — same key/name pairing used across the app
// (hivesController.CATEGORY_NAME_MAP, compatibility.js, HiveDiscoveryPage).
const CATEGORIES = [
  { key: 'social',       name: 'Social Groups' },
  { key: 'professional', name: 'Professional Networking' },
  { key: 'travel',       name: 'Travel Buddies' },
  { key: 'project',      name: 'Project Collaboration' },
  { key: 'event',        name: 'Event Buddies' },
  { key: 'specialized',  name: 'Specialized Groups' },
];

export default function TrendingCategoriesCard() {
  const navigate = useNavigate();

  return (
    <div className="home-card-shell">
      <div className="home-card-label">Trending Categories</div>
      <div className="tcc-chips">
        {CATEGORIES.map(cat => (
          <button
            key={cat.key}
            type="button"
            className="tcc-chip"
            onClick={() => navigate('/category-deep-dive', { state: { category: cat.key } })}
          >
            {cat.name}
          </button>
        ))}
      </div>
    </div>
  );
}
