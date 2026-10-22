import {
  applyTemplateInput,
  completeQuickStartInput,
  createPlaceholderPhotosInput,
  createSectionInput,
  deleteSectionInput,
  placeholderPhotosResultSchema,
  reorderSectionsInput,
  setTalentAttributeInput,
  setTalentSkillsInput,
  studioStateSchema,
  updateSectionInput,
  updateStudioProfileInput,
} from "@workspace/schema"

import { callProcedure } from "../trpc/errors.js"
import { router, talentProcedure } from "../trpc/trpc.js"
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

export const talentRouter = router({
  studio: router({
    get: talentProcedure.output(studioStateSchema).query(({ ctx }) => {
      return callProcedure(() => getStudioState(ctx.db, ctx.userId))
    }),

    updateProfile: talentProcedure
      .input(updateStudioProfileInput)
      .output(studioStateSchema)
      .mutation(({ ctx, input }) => {
        return callProcedure(() =>
          updateStudioProfile(ctx.db, ctx.userId, input)
        )
      }),

    publish: talentProcedure.output(studioStateSchema).mutation(({ ctx }) => {
      return callProcedure(() => publishTalent(ctx.db, ctx.userId))
    }),

    unpublish: talentProcedure.output(studioStateSchema).mutation(({ ctx }) => {
      return callProcedure(() => unpublishTalent(ctx.db, ctx.userId))
    }),

    completeQuickStart: talentProcedure
      .input(completeQuickStartInput)
      .output(studioStateSchema)
      .mutation(({ ctx, input }) => {
        return callProcedure(() =>
          completeQuickStart(ctx.db, ctx.userId, input)
        )
      }),

    createPlaceholderPhotos: talentProcedure
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
    create: talentProcedure
      .input(createSectionInput)
      .output(studioStateSchema)
      .mutation(({ ctx, input }) => {
        return callProcedure(async () => {
          await createSection(ctx.db, ctx.userId, input.type)
          return getStudioState(ctx.db, ctx.userId)
        })
      }),

    update: talentProcedure
      .input(updateSectionInput)
      .output(studioStateSchema)
      .mutation(({ ctx, input }) => {
        return callProcedure(() => updateSection(ctx.db, ctx.userId, input))
      }),

    reorder: talentProcedure
      .input(reorderSectionsInput)
      .output(studioStateSchema)
      .mutation(({ ctx, input }) => {
        return callProcedure(() =>
          reorderSections(ctx.db, ctx.userId, input.sectionIds)
        )
      }),

    delete: talentProcedure
      .input(deleteSectionInput)
      .output(studioStateSchema)
      .mutation(({ ctx, input }) => {
        return callProcedure(() =>
          deleteSection(ctx.db, ctx.userId, input.sectionId)
        )
      }),

    applyTemplate: talentProcedure
      .input(applyTemplateInput)
      .output(studioStateSchema)
      .mutation(({ ctx, input }) => {
        return callProcedure(() =>
          applyTemplate(ctx.db, ctx.userId, input.templateId)
        )
      }),
  }),

  skills: router({
    set: talentProcedure
      .input(setTalentSkillsInput)
      .output(studioStateSchema)
      .mutation(({ ctx, input }) => {
        return callProcedure(() =>
          setTalentSkills(ctx.db, ctx.userId, input.skillIds)
        )
      }),
  }),

  attributes: router({
    set: talentProcedure
      .input(setTalentAttributeInput)
      .output(studioStateSchema)
      .mutation(({ ctx, input }) => {
        return callProcedure(() =>
          setTalentAttribute(ctx.db, ctx.userId, input)
        )
      }),
  }),
})
