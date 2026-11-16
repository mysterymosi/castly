import {
  completeQuickStartInput,
  deckCardSchema,
  liveTalentSlugsSchema,
  createPlaceholderPhotosInput,
  placeholderPhotosResultSchema,
  publicPortfolioInput,
  publicPortfolioSchema,
  addTalentPhotoInput,
  replaceTalentPhotoInput,
  createCreditInput,
  deleteCreditInput,
  reorderCreditsInput,
  setCanvasInput,
  setShowreelInput,
  setTalentAccentsInput,
  setTalentPhotosInput,
  setTalentAvailabilityInput,
  setTalentCategoriesInput,
  setTalentAttributeInput,
  setTalentLanguagesInput,
  setTalentRatesInput,
  setTalentSkillsInput,
  updateCreditInput,
  studioStateSchema,
  updateStudioProfileInput,
} from "@workspace/schema"

import { callProcedure } from "../trpc/errors.js"
import { publicProcedure, router, talentProcedure } from "../trpc/trpc.js"
import {
  addTalentPhoto,
  createCredit,
  deleteCredit,
  reorderCredits,
  setTalentAccents,
  setTalentAttribute,
  setTalentAvailability,
  setTalentLanguages,
  setTalentPhotos,
  setTalentRates,
  setTalentSkills,
  swapTalentPhoto,
  updateCredit,
} from "./content-service.js"
import { consumePublicRead } from "./public-rate-limit.js"
import { getPublicPortfolio, listLiveTalentSlugs } from "./public-service.js"
import {
  completeQuickStart,
  createPlaceholderPhotos,
  getStudioState,
  previewDeckCard,
  publishTalent,
  setStudioCanvas,
  setStudioShowreel,
  setTalentCategories,
  unpublishTalent,
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

    /** The talent's own card as a booker sees it (the studio preview). */
    previewCard: talentProcedure.output(deckCardSchema).query(({ ctx }) => {
      return callProcedure(() => previewDeckCard(ctx.db, ctx.userId))
    }),

    updateProfile: talentMutation
      .input(updateStudioProfileInput)
      .output(studioStateSchema)
      .mutation(({ ctx, input }) => {
        return callProcedure(() =>
          updateStudioProfile(ctx.db, ctx.userId, input)
        )
      }),

    setCanvas: talentMutation
      .input(setCanvasInput)
      .output(studioStateSchema)
      .mutation(({ ctx, input }) => {
        return callProcedure(() =>
          setStudioCanvas(ctx.db, ctx.userId, input.mediaId)
        )
      }),

    /** The showreel: a ready video, or null to remove it. */
    setShowreel: talentMutation
      .input(setShowreelInput)
      .output(studioStateSchema)
      .mutation(({ ctx, input }) => {
        return callProcedure(() => setStudioShowreel(ctx.db, ctx.userId, input.mediaId))
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

  categories: router({
    set: talentMutation
      .input(setTalentCategoriesInput)
      .output(studioStateSchema)
      .mutation(({ ctx, input }) => {
        return callProcedure(() =>
          setTalentCategories(ctx.db, ctx.userId, input.categoryIds)
        )
      }),
  }),

  skills: router({
    set: talentMutation
      .input(setTalentSkillsInput)
      .output(studioStateSchema)
      .mutation(({ ctx, input }) => {
        return callProcedure(() =>
          setTalentSkills(ctx.db, ctx.userId, input.skillIds, input.proficiency)
        )
      }),
  }),

  photos: router({
    set: talentMutation
      .input(setTalentPhotosInput)
      .output(studioStateSchema)
      .mutation(({ ctx, input }) => {
        return callProcedure(() => setTalentPhotos(ctx.db, ctx.userId, input.mediaIds))
      }),

    add: talentMutation
      .input(addTalentPhotoInput)
      .output(studioStateSchema)
      .mutation(({ ctx, input }) => {
        return callProcedure(() => addTalentPhoto(ctx.db, ctx.userId, input.mediaId))
      }),

    replace: talentMutation
      .input(replaceTalentPhotoInput)
      .output(studioStateSchema)
      .mutation(({ ctx, input }) => {
        return callProcedure(() =>
          swapTalentPhoto(ctx.db, ctx.userId, input.mediaId, input.withMediaId)
        )
      }),
  }),

  credits: router({
    create: talentMutation
      .input(createCreditInput)
      .output(studioStateSchema)
      .mutation(({ ctx, input }) => {
        return callProcedure(() => createCredit(ctx.db, ctx.userId, input))
      }),

    update: talentMutation
      .input(updateCreditInput)
      .output(studioStateSchema)
      .mutation(({ ctx, input }) => {
        return callProcedure(() => updateCredit(ctx.db, ctx.userId, input))
      }),

    delete: talentMutation
      .input(deleteCreditInput)
      .output(studioStateSchema)
      .mutation(({ ctx, input }) => {
        return callProcedure(() => deleteCredit(ctx.db, ctx.userId, input.creditId))
      }),

    reorder: talentMutation
      .input(reorderCreditsInput)
      .output(studioStateSchema)
      .mutation(({ ctx, input }) => {
        return callProcedure(() => reorderCredits(ctx.db, ctx.userId, input.creditIds))
      }),
  }),

  languages: router({
    set: talentMutation
      .input(setTalentLanguagesInput)
      .output(studioStateSchema)
      .mutation(({ ctx, input }) => {
        return callProcedure(() => setTalentLanguages(ctx.db, ctx.userId, input.languages))
      }),
  }),

  accents: router({
    set: talentMutation
      .input(setTalentAccentsInput)
      .output(studioStateSchema)
      .mutation(({ ctx, input }) => {
        return callProcedure(() => setTalentAccents(ctx.db, ctx.userId, input.accentIds))
      }),
  }),

  rates: router({
    set: talentMutation
      .input(setTalentRatesInput)
      .output(studioStateSchema)
      .mutation(({ ctx, input }) => {
        return callProcedure(() => setTalentRates(ctx.db, ctx.userId, input.rates))
      }),
  }),

  availability: router({
    set: talentMutation
      .input(setTalentAvailabilityInput)
      .output(studioStateSchema)
      .mutation(({ ctx, input }) => {
        return callProcedure(() => setTalentAvailability(ctx.db, ctx.userId, input.months))
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
