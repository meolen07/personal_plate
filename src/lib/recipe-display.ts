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

/** Imperative / technique words that mark a real cooking step. */
const COOKING_VERB_RE =
  /\b(?:add|boil|simmer|chop|dice|mince|slice|peel|mix|stir|heat|cook|bake|roast|saute|saut[eé]|fry|grill|whisk|pour|drain|season|preheat|combine|blend|serve|bring|remove|transfer|cover|reduce|marinate|toss|fold|knead|plate|garnish|melt|toast|steam|broil|sear|brown|rinse|pat|cut|place|set aside|let (?:it |them )?rest|allow|continue|repeat|taste|adjust|sprinkle|drizzle|brush|layer|assemble|refrigerate|freeze|thaw|defrost|microwave|puree|pur[eé]e|process|pulse|strain|skim|scrape|flip|turn|cool|warm|soften|dissolve|incorporate|beat|cream|whip|stuff|fill|top with|finish|prepare|gather|wash|dry|trim|score|pierce|prick|soak|steep|infuse|knead|proof|rise|roll|spread|squeeze|grate|shred|crush|mash|pound|pound|whisk in|stir in|fold in|pour in|bring to|reduce heat|turn off|turn on|set the|put the|take the|using a|with a whisk|until (?:tender|golden|soft|thick|bubbling|fragrant|combined|smooth))\b/i;

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

function looksLikeAuthorSignOff(text: string): boolean {
  if (text.length > 80) return false;
  if (COOKING_VERB_RE.test(text)) return false;
  if (/\d/.test(text)) return false;

  if (
    /^(?:xo+|xoxo|love[,!]?\s|cheers[,!]?\s*|enjoy[!.,]*$|bon app[eé]tit[!.,]*$|happy cooking[!.,]*$|from (?:the )?kitchen)/i.test(
      text
    )
  ) {
    return true;
  }

  // Title-Case nickname / byline without cooking content, e.g. "Seriously Soupy Serena"
  const words = text
    .replace(/[^a-zA-Z\s']/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length < 2 || words.length > 6) return false;
  const titleCaseish = words.every(
    (w) => /^[A-Z][a-z']+$/.test(w) || /^[A-Z]{2,}$/.test(w)
  );
  return titleCaseish && !COOKING_VERB_RE.test(text);
}

/**
 * Spoonacular blog fluff: rhetorical questions, social CTAs, author sign-offs.
 */
export function isBlogFluffStep(text: string): boolean {
  const cleaned = stripHtml(text);
  if (!cleaned) return true;

  // Ignore URL query strings when detecting rhetorical questions.
  const withoutUrls = cleaned.replace(URL_RE, " ").replace(/\s+/g, " ").trim();
  if (!withoutUrls) return false;

  if (/\bwhat do you usually\b/i.test(withoutUrls)) return true;

  if (
    /\b(?:follow me|subscribe(?: to)?|leave a comment|pin (?:this|it)|share (?:this|it|on)|tag me|let me know in the comments|check out my|don'?t forget to (?:like|share|comment|subscribe)|snap a (?:pic|photo)|post a (?:pic|photo)|hit (?:that )?like|drop a comment)\b/i.test(
      withoutUrls
    )
  ) {
    return true;
  }

  // Engagement / rhetorical questions (almost never real cooking steps)
  if (/\?/.test(withoutUrls)) {
    if (
      /^(?:what|why|how|who|when|where|do you|did you|have you|are you|isn'?t|would you|can you|could you|what'?s your|any (?:favorites|tips)|tell me)\b/i.test(
        withoutUrls
      )
    ) {
      return true;
    }
    // Bare question with no cooking verb → fluff
    if (!COOKING_VERB_RE.test(withoutUrls)) return true;
  }

  if (looksLikeAuthorSignOff(withoutUrls)) return true;

  return false;
}

/**
 * Prefer keeping steps that look like real cooking directions.
 * Non-fluff lines without verbs are still kept (e.g. "Oven to 350F").
 */
function isLikelyCookingStep(text: string): boolean {
  if (COOKING_VERB_RE.test(text)) return true;
  // Temps, times, or quantities often mark real steps even without a verb match
  if (/\d/.test(text) && text.length >= 12) return true;
  // Short non-question imperatives / labels that survived fluff filters
  if (text.length >= 8 && !/\?$/.test(text)) return true;
  return false;
}

/**
 * Normalize raw instruction strings from Spoonacular (or detail API)
 * into clean display items. Video-only / "Whatch video" junk becomes a
 * single "Watch video" entry. Blog fluff is dropped.
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

    if (isBlogFluffStep(text)) continue;

    if (!isLikelyCookingStep(text)) continue;

    // Soft-fix typo mid-sentence without treating whole step as video-only
    const cleaned = text.replace(/\bWhatch\b/gi, "Watch");
    items.push({ kind: "step", text: cleaned });
  }

  return items;
}

/** Minimum real cooking steps before we trust the list in the UI. */
export const MIN_DISPLAY_COOKING_STEPS = 2;

export function countCookingSteps(items: DisplayInstruction[]): number {
  return items.filter((item) => item.kind === "step").length;
}

/**
 * Whether the normalized list is rich enough to show (avoids 0–1 leftover
 * junk lines after fluff filtering).
 */
export function hasEnoughCookingSteps(
  items: DisplayInstruction[],
  min = MIN_DISPLAY_COOKING_STEPS
): boolean {
  return countCookingSteps(items) >= min;
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
