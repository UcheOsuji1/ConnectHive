// "🐍 Python" -> "python" — strips the leading emoji so a typed "Python"
// dedupes against the taxonomy chip "🐍 Python". Shared by ProfileSetupPage's
// custom-skill/interest entry and SkillPicker's selection logic, so both
// treat "the same skill, differently spelled or emoji-less" as one entry.
export function labelOf(chip) {
  return chip.split(' ').slice(1).join(' ').toLowerCase() || chip.toLowerCase();
}

export function sameSkill(a, b) {
  return labelOf(a) === labelOf(b);
}
