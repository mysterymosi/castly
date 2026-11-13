import { currentSchemaVersion, type CoreSectionType, type TalentSectionDto } from "@workspace/schema"

/**
 * The portfolio's layout is fixed by Castly, not arranged by the talent (PRD §7.1, revised): the
 * talent fills in their information and it lands in this order. Sections with nothing in them are
 * left out (`sectionHasContent`), so a portfolio grows fuller as the talent adds more. Photos are
 * not sections: Main leads, the rest are spread between these by `layoutPortfolio`.
 *
 * On-camera talent lead with who they are; crew, production and events with their work, as the
 * deck card opens them on it (PRD §7.2.1). Every booker sees the same structure for the same kind
 * of talent, so a credit list is always where they expect it.
 */
export type PortfolioLayoutKind = "on_camera" | "work"

export const portfolioLayouts: Record<PortfolioLayoutKind, readonly CoreSectionType[]> = {
  on_camera: ["about", "attributes", "skills", "languages", "credits", "showreel", "availability", "rates"],
  work: ["credits", "showreel", "about", "skills", "attributes", "languages", "availability", "rates"],
}

export type CategoryKind = "on_camera" | "crew" | "production" | "events"

/** The layout for a talent's primary category; on-camera when they have none yet. */
export function portfolioLayoutKind(categoryKind: CategoryKind | null): PortfolioLayoutKind {
  return categoryKind === null || categoryKind === "on_camera" ? "on_camera" : "work"
}

export function portfolioLayoutFor(categoryKind: CategoryKind | null): readonly CoreSectionType[] {
  return portfolioLayouts[portfolioLayoutKind(categoryKind)]
}

/** Fixed display settings each section renders with; the talent no longer configures them. */
function sectionConfig(type: CoreSectionType, showreelMediaId: string | null): unknown {
  switch (type) {
    case "showreel":
      return { mediaId: showreelMediaId }
    case "credits":
      return { signatureOnly: false }
    case "attributes":
      return { showHidden: false }
    case "skills":
      return { highlightTop: 5 }
    case "languages":
      return { showAccents: true }
    case "rates":
      return { showCurrency: true }
    case "availability":
      return { horizonMonths: 3 }
    default:
      return {}
  }
}

/** A stable id per section type, so renderers can key on it; nothing is stored under it. */
function sectionId(type: CoreSectionType): string {
  const n = (portfolioLayouts.work.indexOf(type) + 1).toString(16).padStart(12, "0")
  return `00000000-0000-4000-8000-${n}`
}

/** The talent's sections in layout order, as renderers take them. All visible; empty ones drop out. */
export function portfolioSections(
  categoryKind: CategoryKind | null,
  showreelMediaId: string | null
): TalentSectionDto[] {
  return portfolioLayoutFor(categoryKind).map((type, position) => ({
    id: sectionId(type),
    type,
    schemaVersion: currentSchemaVersion(type),
    position,
    isVisible: true,
    config: sectionConfig(type, showreelMediaId),
  }))
}
