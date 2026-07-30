/**
 * Display-side helpers for ranked recipe cards: clean Spoonacular steps,
 * normalize video-only junk, and avoid messy ingredient duplication.
 */

export type DisplayInstruction =
  | { kind: "step"; text: string }
  | { kind: "video"; href: string | null; label: string };

const URL_RE = /https?:\/\/[^\s<>"']+/i;
const VIDEO_PHRASE_RE =
  /^(?:please\s+)?(?:wh?atch|see|view|check\s+out)(?:\s+the)?\s+video\b/i;

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractUrl(value: string): string | null {
  const match = value.match(URL_RE);
  return match ? match[0].replace(/[),.;]+$/, "") : null;
}

function isUselessStep(text: string): boolean {
  if (!text) return true;
  if (text.length < 2) return true;
  if (/^(undefined|null|n\/a|none\.?)$/i.test(text)) return true;
  if (/^[\d.\-•*]+$/.test(text)) return true;
  return false;
}

function isVideoOnlyStep(text: string): boolean {
  if (VIDEO_PHRASE_RE.test(text)) return true;
  const url = extractUrl(text);
  if (!url) return false;
  const remainder = text.replace(URL_RE, "").replace(/[\s.:,;-]+/g, "").trim();
  return remainder.length === 0 || VIDEO_PHRASE_RE.test(remainder);
}

/**
 * Normalize raw instruction strings from Spoonacular (or detail API)
 * into clean display items. Video-only / "Whatch video" junk becomes a
 * single "Watch video" entry.
 */
export function normalizeDisplayInstructions(
  raw: unknown
): DisplayInstruction[] {
  if (!Array.isArray(raw)) return [];

  const items: DisplayInstruction[] = [];
  let videoIndex = -1;

  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const text = stripHtml(entry);
    if (isUselessStep(text)) continue;

    if (isVideoOnlyStep(text)) {
      const href = extractUrl(text);
      if (videoIndex >= 0) {
        const existing = items[videoIndex];
        if (existing?.kind === "video" && !existing.href && href) {
          items[videoIndex] = { kind: "video", href, label: "Watch video" };
        }
        continue;
      }
      videoIndex = items.length;
      items.push({
        kind: "video",
        href,
        label: "Watch video",
      });
      continue;
    }

    // Soft-fix typo mid-sentence without treating whole step as video-only
    const cleaned = text.replace(/\bWhatch\b/gi, "Watch");
    items.push({ kind: "step", text: cleaned });
  }

  return items;
}

/** Plain string steps for storage / ranking (video steps kept as "Watch video"). */
export function cleanInstructionStrings(raw: unknown): string[] {
  return normalizeDisplayInstructions(raw).map((item) => {
    if (item.kind === "video") {
      return item.href ? `Watch video: ${item.href}` : "Watch video";
    }
    return item.text;
  });
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\(needed\)/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Prefer full recipe ingredient lines when they add detail beyond
 * matched/missing name lists (e.g. quantities from Spoonacular).
 */
export function shouldShowRecipeIngredients(
  recipeIngredients: string[] | undefined,
  matched: string[],
  missing: string[]
): string[] {
  if (!recipeIngredients?.length) return [];

  const cleaned = recipeIngredients
    .map((ing) => (typeof ing === "string" ? stripHtml(ing) : ""))
    .filter(Boolean);

  if (cleaned.length === 0) return [];

  const known = new Set(
    [...matched, ...missing].map(normalizeName).filter(Boolean)
  );

  const addsDetail = cleaned.some((line) => {
    const name = normalizeName(line);
    if (!known.has(name)) return true;
    // Same name but line has quantity / prep detail
    return /\d/.test(line) || line.length > name.length + 4;
  });

  // If every line is essentially a duplicate of matched/missing names, skip
  if (!addsDetail && cleaned.length <= known.size) {
    return [];
  }

  return cleaned;
}
