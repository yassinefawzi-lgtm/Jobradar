const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "’",
  lsquo: "‘",
  laquo: "«",
  raquo: "»",
  eacute: "é",
  egrave: "è",
  agrave: "à",
  ccedil: "ç",
  hellip: "…",
  euro: "€",
};

export function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m);
}

/** Convertit un fragment HTML en texte lisible (paragraphes et puces conservés). Jamais rendu comme HTML. */
export function htmlToText(input: string | null | undefined): string | null {
  if (!input) return null;
  const text = decodeEntities(
    input
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li[^>]*>/gi, "\n• ")
      .replace(/<\/(p|div|h[1-6]|li|ul|ol)>/gi, "\n")
      .replace(/<h[1-6][^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text || null;
}

/** Minuscules, sans accents ni ponctuation : pour comparer et chercher des mots-clés. */
export function fold(input: string | null | undefined): string {
  return (input ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9+#]+/g, " ")
    .trim();
}

/** Titre sans les mentions de genre et de lieu ajoutées par les sites ("H/F", "- Rouen"…). */
export function cleanTitle(title: string): string {
  return title
    .replace(/\(?\b(h\s*\/\s*f|f\s*\/\s*h|h\s*\/\s*f\s*\/\s*x|f\s*\/\s*h\s*\/\s*x|h-f|f-h)\b\)?/gi, "")
    .replace(/\s+-\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function tokens(input: string): string[] {
  const stop = new Set(["de", "du", "des", "la", "le", "les", "en", "et", "a", "au", "aux", "d", "l", "un", "une", "pour", "h", "f", "x"]);
  return fold(input)
    .split(" ")
    .filter((t) => t.length > 1 && !stop.has(t));
}
