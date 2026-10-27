/**
 * Semantic content of rendered portfolio HTML: what a viewer learns, not how it looks.
 * Both renderers' output is reduced to this shape and compared (TECH_SPEC §9.2).
 */
export type SemanticSection = {
  type: string
  /** Visible text nodes, trimmed, sorted. Headings and placeholders are excluded. */
  texts: string[]
  /** Media ids in the order they first appear in a media URL. */
  mediaIds: string[]
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g

const entities: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#x27;": "'",
  "&#39;": "'",
  "&nbsp;": " ",
}

function decode(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|nbsp|#x27|#39);/g, (e) => entities[e] ?? e)
}

/** Section headings (web `<h2>`, native header role) and empty-state placeholders are chrome. */
function stripChrome(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<h2\b[^>]*>[\s\S]*?<\/h2>/g, "")
    .replace(/<span\b[^>]*data-role="header"[^>]*>[\s\S]*?<\/span>/g, "")
    .replace(/<span\b[^>]*data-testid="portfolio-placeholder"[^>]*>[\s\S]*?<\/span>/g, "")
}

function texts(html: string): string[] {
  const nodes = html
    .split(/<[^>]+>/)
    .map((node) => decode(node).replace(/\s+/g, " ").trim())
    .filter(Boolean)
  return [...new Set(nodes)].sort()
}

/** Ids inside media URLs only (src, srcset, poster), so a credit link or key never counts. */
function mediaIds(html: string): string[] {
  const ids: string[] = []
  for (const match of html.matchAll(/\s(?:src|srcset|srcSet|poster)="([^"]*)"/g)) {
    for (const id of match[1]!.match(UUID) ?? []) {
      if (!ids.includes(id)) ids.push(id)
    }
  }
  return ids
}

export function extractSection(type: string, html: string): SemanticSection {
  const body = stripChrome(html)
  return { type, texts: texts(body), mediaIds: mediaIds(body) }
}

export function isEmpty(section: SemanticSection): boolean {
  return section.texts.length === 0 && section.mediaIds.length === 0
}

/** Splits the web page by its `data-section-type` shells, in document order. */
export function extractWebSections(html: string): SemanticSection[] {
  const sections: SemanticSection[] = []
  for (const match of html.matchAll(
    /<section\b[^>]*data-section-type="([a-z_]+)"[^>]*>([\s\S]*?)<\/section>/g
  )) {
    sections.push(extractSection(match[1]!, match[2]!))
  }
  return sections
}
