// Fractional indexing — the one mechanism every task/milestone reorder uses,
// so a move only ever writes the single moved row's position, never
// renumbering its neighbors.
export function positionBetween(beforePos, afterPos) {
  const b = beforePos == null ? null : Number(beforePos);
  const a = afterPos == null ? null : Number(afterPos);
  if (b == null && a == null) return 0;
  if (b == null) return a - 1;
  if (a == null) return b + 1;
  return (b + a) / 2;
}
