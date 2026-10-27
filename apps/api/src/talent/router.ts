import {
  applyTemplateInput,
  completeQuickStartInput,
  liveTalentSlugsSchema,
  createPlaceholderPhotosInput,
  createSectionInput,
  deleteSectionInput,
  placeholderPhotosResultSchema,
  publicPortfolioInput,
  publicPortfolioSchema,
  reorderSectionsInput,
  setTalentAttributeInput,
  setTalentSkillsInput,
  studioStateSchema,
  updateSectionInput,
  updateStudioProfileInput,
} from "@workspace/schema"

import { callProcedure } from "../trpc/errors.js"
import { publicProcedure, router, talentProcedure } from "../trpc/trpc.js"
import { consumePublicRead } from "./public-rate-limit.js"
import { getPublicPortfolio, listLiveTalentSlugs } from "./public-service.js"
import {
  applyTemplate,
  completeQuickStart,
  createPlaceholderPhotos,
  createSection,
  deleteSection,
  getStudioState,
  publishTalent,
  reorderSections,
  setTalentAttribute,
  setTalentSkills,
  unpublishTalent,
  updateSection,
  updateStudioProfile,
} from "./studio-service.js"
import { schedulePublicPortfolioRevalidate } from "./web-revalidate.js"

/** Anonymous portfolio reads, rate limited per client IP (or the web server's own bucket). */
const publicReadProcedure = publicProcedure.use(async ({ ctx, next }) => {
  await callProcedure(async () => consumePublicRead(ctx.ip, ctx.webKey))
  return next()
})

/** Every talent write can change the public page, so a success refreshes the web cache. */
const talentMutation = talentProcedure.use(async ({ ctx, next }) => {
  const result = await next()
  if (result.ok) schedulePublicPortfolioRevalidate(ctx.db, ctx.userId)
  return result
})

export const talentRouter = router({
  /** Anonymous reads for the public web portfolio (`castly.app/{slug}`). */
  public: router({
    bySlug: publicReadProcedure
      .input(publicPortfolioInput)
      .output(publicPortfolioSchema)
      .query(({ ctx, input }) => {
        return callProcedure(() => getPublicPortfolio(ctx.db, input.slug))
      }),

    liveSlugs: publicReadProcedure.output(liveTalentSlugsSchema).query(({ ctx }) => {
      return callProcedure(() => listLiveTalentSlugs(ctx.db))
    }),
  }),

  studio: router({
    get: talentProcedure.output(studioStateSchema).query(({ ctx }) => {
      return callProcedure(() => getStudioState(ctx.db, ctx.userId))
    }),

    updateProfile: talentMutation
      .input(updateStudioProfileInput)
      .output(studioStateSchema)
      .mutation(({ ctx, input }) => {
        return callProcedure(() =>
          updateStudioProfile(ctx.db, ctx.userId, input)
        )
      }),

    publish: talentMutation.output(studioStateSchema).mutation(({ ctx }) => {
      return callProcedure(() => publishTalent(ctx.db, ctx.userId))
    }),

    unpublish: talentMutation.output(studioStateSchema).mutation(({ ctx }) => {
      return callProcedure(() => unpublishTalent(ctx.db, ctx.userId))
    }),

    completeQuickStart: talentMutation
      .input(completeQuickStartInput)
      .output(studioStateSchema)
      .mutation(({ ctx, input }) => {
        return callProcedure(() =>
          completeQuickStart(ctx.db, ctx.userId, input)
        )
      }),

    createPlaceholderPhotos: talentMutation
      .input(createPlaceholderPhotosInput)
      .output(placeholderPhotosResultSchema)
      .mutation(({ ctx, input }) => {
        return callProcedure(async () => {
          const mediaIds = await createPlaceholderPhotos(
            ctx.db,
            ctx.userId,
            input.count
          )
          return { mediaIds }
        })
      }),
  }),

  sections: router({
    create: talentMutation
      .input(createSectionInput)
      .output(studioStateSchema)
      .mutation(({ ctx, input }) => {
        return callProcedure(async () => {
          await createSection(ctx.db, ctx.userId, input.type)
          return getStudioState(ctx.db, ctx.userId)
        })
      }),

    update: talentMutation
      .input(updateSectionInput)
      .output(studioStateSchema)
      .mutation(({ ctx, input }) => {
        return callProcedure(() => updateSection(ctx.db, ctx.userId, input))
      }),

    reorder: talentMutation
      .input(reorderSectionsInput)
      .output(studioStateSchema)
      .mutation(({ ctx, input }) => {
        return callProcedure(() =>
          reorderSections(ctx.db, ctx.userId, input.sectionIds)
        )
      }),

    delete: talentMutation
      .input(deleteSectionInput)
      .output(studioStateSchema)
      .mutation(({ ctx, input }) => {
        return callProcedure(() =>
          deleteSection(ctx.db, ctx.userId, input.sectionId)
        )
      }),

    applyTemplate: talentMutation
      .input(applyTemplateInput)
      .output(studioStateSchema)
      .mutation(({ ctx, input }) => {
        return callProcedure(() =>
          applyTemplate(ctx.db, ctx.userId, input.templateId)
        )
      }),
  }),

  skills: router({
    set: talentMutation
      .input(setTalentSkillsInput)
      .output(studioStateSchema)
      .mutation(({ ctx, input }) => {
        return callProcedure(() =>
          setTalentSkills(ctx.db, ctx.userId, input.skillIds)
        )
      }),
  }),

  attributes: router({
    set: talentMutation
      .input(setTalentAttributeInput)
      .output(studioStateSchema)
      .mutation(({ ctx, input }) => {
        return callProcedure(() =>
          setTalentAttribute(ctx.db, ctx.userId, input)
        )
      }),
  }),
})
