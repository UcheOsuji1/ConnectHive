// Pure matching logic for Meet someone new (Prompt 64 Part 2) — no DB calls,
// so it's trivial to unit-test with hand-fed score maps. The job
// (jobs/coffeeChatJob.js) does all the fetching/writing and calls these.

export function dyadKey(a, b) {
  return [a, b].sort().join('|');
}

// Every pairwise combination that was together (pair or trio) in any of the
// given rounds' user_ids arrays — the "no repeats within 3 rounds" set.
export function recentDyads(roundsUserIdsArrays) {
  const set = new Set();
  for (const ids of roundsUserIdsArrays) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) set.add(dyadKey(ids[i], ids[j]));
    }
  }
  return set;
}

// Classic greedy max-weight matching: every eligible edge sorted by score
// descending, taken unless either endpoint is already used.
export function greedyMatch(candidateIds, scores, excluded) {
  const edges = [];
  for (let i = 0; i < candidateIds.length; i++) {
    for (let j = i + 1; j < candidateIds.length; j++) {
      const a = candidateIds[i], b = candidateIds[j];
      const key = dyadKey(a, b);
      if (excluded.has(key)) continue;
      edges.push({ a, b, score: scores.get(key) ?? 0 });
    }
  }
  edges.sort((x, y) => y.score - x.score);

  const used = new Set();
  const pairs = [];
  for (const e of edges) {
    if (used.has(e.a) || used.has(e.b)) continue;
    pairs.push([e.a, e.b]);
    used.add(e.a);
    used.add(e.b);
  }
  const leftover = candidateIds.filter(id => !used.has(id));
  return { pairs, leftover };
}

// Fairness: whoever sat out last round is matched first, to their own best
// eligible partner — then the rest is a normal greedy match. If the priority
// person has no eligible partner (e.g. every pairing is within the 3-round
// window), this degrades to a plain greedy match over everyone.
export function prioritizedMatch(candidateIds, scores, excluded, priorityId) {
  if (!priorityId || !candidateIds.includes(priorityId)) {
    return greedyMatch(candidateIds, scores, excluded);
  }
  let best = null;
  for (const id of candidateIds) {
    if (id === priorityId) continue;
    const key = dyadKey(priorityId, id);
    if (excluded.has(key)) continue;
    const score = scores.get(key) ?? 0;
    if (!best || score > best.score) best = { id, score };
  }
  if (!best) return greedyMatch(candidateIds, scores, excluded);

  const rest = candidateIds.filter(id => id !== priorityId && id !== best.id);
  const { pairs, leftover } = greedyMatch(rest, scores, excluded);
  return { pairs: [[priorityId, best.id], ...pairs], leftover };
}

// An odd leftover joins whichever already-formed pair scores best WITH them
// (sum of both pairwise scores) — "add the leftover person to the
// best-scoring pair" read as best-scoring *for* them. Returns -1 if there
// are no pairs to join (the whole candidate pool was just the one person).
export function bestTrioHost(pairs, leftoverId, scores) {
  let bestIdx = -1;
  let bestScore = -Infinity;
  pairs.forEach((p, i) => {
    const s = (scores.get(dyadKey(leftoverId, p[0])) ?? 0) + (scores.get(dyadKey(leftoverId, p[1])) ?? 0);
    if (s > bestScore) { bestScore = s; bestIdx = i; }
  });
  return bestIdx;
}
