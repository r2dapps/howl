/** Small Lucide-style set for companion avatars (not emoji). */
export const ICONS = [
  "heart",
  "moon",
  "star",
  "spark",
  "flower",
  "flame",
  "music",
  "cloud",
  "leaf",
  "sun",
  "book",
  "crown",
];

export function iconHref(id) {
  return ICONS.includes(id) ? "#i-" + id : "#i-heart";
}
