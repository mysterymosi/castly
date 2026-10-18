import type { z } from "zod"

import {
  aboutConfigV1,
  attributesConfigV1,
  availabilityConfigV1,
  creditsConfigV1,
  galleryConfigV1,
  languagesConfigV1,
  ratesConfigV1,
  showreelConfigV1,
  skillsConfigV1,
} from "./definitions/core"
import { heroConfigV2 } from "./definitions/hero"
import type { CoreSectionType } from "./section-type-aliases"

export type CoreSectionConfigMap = {
  hero: z.infer<typeof heroConfigV2>
  about: z.infer<typeof aboutConfigV1>
  gallery: z.infer<typeof galleryConfigV1>
  showreel: z.infer<typeof showreelConfigV1>
  credits: z.infer<typeof creditsConfigV1>
  attributes: z.infer<typeof attributesConfigV1>
  skills: z.infer<typeof skillsConfigV1>
  languages: z.infer<typeof languagesConfigV1>
  rates: z.infer<typeof ratesConfigV1>
  availability: z.infer<typeof availabilityConfigV1>
}

export type CoreSectionConfig<T extends CoreSectionType = CoreSectionType> =
  CoreSectionConfigMap[T]
