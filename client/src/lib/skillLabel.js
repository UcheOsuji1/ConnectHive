// "🐍 Python" -> "python" — strips only the leading non-letter/non-digit run
// (emoji, variation selectors, ZWJ, the space after it), not the first
// "word": splitting on the first space (the old approach) silently ate the
// first real word of any emoji-less entry — "Data science" became "science",
// and "Underwater welding" / "Overwater welding" both collapsed to "welding".
// Shared by ProfileSetupPage's custom-skill/interest entry and SkillPicker's
// selection logic, so both treat "the same skill, differently spelled or
// emoji-less" as one entry.
export function labelOf(chip) {
  return String(chip).replace(/^[^\p{L}\p{N}]+/u, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function sameSkill(a, b) {
  return labelOf(a) === labelOf(b);
}
