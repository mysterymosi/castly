import type { CoreSectionType } from "@workspace/schema"
import { currentSchemaVersion } from "@workspace/schema"

export function defaultSectionConfig(type: CoreSectionType): unknown {
  switch (type) {
    case "hero":
      return { style: "minimal", mediaId: null, showBadges: true, subtitle: undefined }
    case "about":
      return {}
    case "gallery":
      return { mediaIds: [], layout: "grid" }
    case "showreel":
      return { mediaId: null }
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
    default: {
      const _exhaustive: never = type
      return _exhaustive
    }
  }
}

export function defaultSchemaVersion(type: CoreSectionType): number {
  return currentSchemaVersion(type)
}
