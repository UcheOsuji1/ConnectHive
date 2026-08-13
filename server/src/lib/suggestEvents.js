// STAGE 2 (AI): LLM re-rank plugs in here — same seam pattern as runMatching().

function normalizeCity(str) {
  if (!str) return '';
  return String(str).toLowerCase().split(',')[0].trim();
}

function citiesMatch(a, b) {
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

export async function suggestEvents(db, userId, { limit = 3 } = {}) {
  // 1. User's active hive memberships + profile location
  const { rows: myHives } = await db.query(
    `SELECT h.hive_id, h.hive_name, h.category_id, c.category_name, h.location
     FROM hive_members hm
     JOIN hives h ON h.hive_id = hm.hive_id
     LEFT JOIN categories c ON c.category_id = h.category_id
     WHERE hm.user_id = $1 AND hm.membership_status = 'active'`,
    [userId],
  );
  const { rows: [profile] } = await db.query(
    'SELECT location FROM profiles WHERE user_id = $1',
    [userId],
  );

  const myCategoryIds = new Set(myHives.map(h => h.category_id).filter(Boolean));
  const profileCity = normalizeCity(profile?.location);
  const myHiveCities = myHives.map(h => normalizeCity(h.location)).filter(Boolean);

  // 2. Candidate upcoming events from discoverable, active hives the user hasn't joined
  const { rows: candidates } = await db.query(
    `SELECT p.post_id, p.headline, p.event_at, p.event_location,
            h.hive_id, h.hive_name, h.location AS hive_location, h.category_id,
            c.category_name
     FROM hive_posts p
     JOIN hives h ON h.hive_id = p.hive_id
     LEFT JOIN categories c ON c.category_id = h.category_id
     WHERE p.post_type = 'event'
       AND p.event_at > NOW()
       AND h.discoverable = TRUE
       AND h.hive_status = 'active'
       AND NOT EXISTS(
         SELECT 1 FROM hive_members
         WHERE hive_id = h.hive_id AND user_id = $1 AND membership_status = 'active'
       )
     ORDER BY p.event_at ASC`,
    [userId],
  );
  if (!candidates.length) return [];

  // 3. Score each candidate
  const scored = [];
  for (const ev of candidates) {
    let score = 0;
    const reasonParts = [];

    const categoryMatch = ev.category_id && myCategoryIds.has(ev.category_id);
    if (categoryMatch) {
      score += 2;
      const myMatchingHive = myHives.find(h => h.category_id === ev.category_id);
      reasonParts.push({ type: 'category', hiveName: myMatchingHive?.hive_name, categoryName: ev.category_name });
    }

    const eventCity = normalizeCity(ev.event_location || ev.hive_location);
    let cityMatch = false;
    let matchedCity = null;
    if (eventCity) {
      if (profileCity && citiesMatch(eventCity, profileCity)) {
        cityMatch = true;
        matchedCity = ev.event_location || ev.hive_location;
      } else if (!profileCity && myHiveCities.some(c => citiesMatch(eventCity, c))) {
        cityMatch = true;
        matchedCity = ev.event_location || ev.hive_location;
      }
    }
    if (cityMatch) {
      score += 2;
      reasonParts.push({ type: 'city', city: matchedCity });
    }

    const { rows: [compat] } = await db.query(
      `SELECT total_score FROM compatibility_scores WHERE user_id = $1 AND hive_id = $2`,
      [userId, ev.hive_id],
    );
    if (compat && Number(compat.total_score) >= 50) score += 1;

    if (score > 0) {
      scored.push({
        post_id:        ev.post_id,
        headline:       ev.headline,
        event_at:       ev.event_at,
        event_location: ev.event_location,
        hive_id:        ev.hive_id,
        hive_name:      ev.hive_name,
        hive_location:  ev.hive_location,
        category_name:  ev.category_name,
        score,
        reason: buildReason(reasonParts),
      });
    }
  }

  scored.sort((a, b) => b.score - a.score || new Date(a.event_at) - new Date(b.event_at));
  return scored.slice(0, limit).map(({ score, ...ev }) => ev);
}

function buildReason(parts) {
  const categoryPart = parts.find(p => p.type === 'category');
  if (categoryPart?.hiveName) {
    return `Because you're in ${categoryPart.hiveName}${categoryPart.categoryName ? ` · ${categoryPart.categoryName}` : ''}`;
  }
  const cityPart = parts.find(p => p.type === 'city');
  if (cityPart?.city) {
    return `Near you in ${cityPart.city}`;
  }
  return null;
}
