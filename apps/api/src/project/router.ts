import {
  createProjectInput,
  createRoleInput,
  listProjectsInput,
  projectDetailSchema,
  projectIdInput,
  projectListSchema,
  roleFormOptionsSchema,
  roleIdInput,
  updateProjectInput,
  updateRoleInput,
} from "@workspace/schema"

import { callProcedure } from "../trpc/errors.js"
import { bookerProcedure, router } from "../trpc/trpc.js"
import { ProjectError } from "./errors.js"
import {
  archiveProject,
  createProject,
  createRole,
  getProject,
  listProjects,
  roleFormOptions,
  updateProject,
  updateRole,
} from "./service.js"

/** A booker's projects. Every procedure is scoped to projects the caller owns. */
export const projectRouter = router({
  list: bookerProcedure
    .input(listProjectsInput)
    .output(projectListSchema)
    .query(({ ctx, input }) => {
      return callProcedure(async () => ({
        projects: await listProjects(ctx.db, ctx.userId, input.includeArchived),
      }))
    }),

  get: bookerProcedure
    .input(projectIdInput)
    .output(projectDetailSchema)
    .query(({ ctx, input }) => {
      return callProcedure(() => getProject(ctx.db, ctx.userId, input.projectId))
    }),

  create: bookerProcedure
    .input(createProjectInput)
    .output(projectDetailSchema)
    .mutation(({ ctx, input }) => {
      return callProcedure(() => createProject(ctx.db, ctx.userId, input))
    }),

  update: bookerProcedure
    .input(updateProjectInput)
    .output(projectDetailSchema)
    .mutation(({ ctx, input }) => {
      return callProcedure(() => updateProject(ctx.db, ctx.userId, input))
    }),

  archive: bookerProcedure
    .input(projectIdInput)
    .output(projectDetailSchema)
    .mutation(({ ctx, input }) => {
      return callProcedure(() => archiveProject(ctx.db, ctx.userId, input.projectId))
    }),
})

export const roleRouter = router({
  formOptions: bookerProcedure.output(roleFormOptionsSchema).query(({ ctx }) => {
    return callProcedure(() => roleFormOptions(ctx.db))
  }),

  create: bookerProcedure
    .input(createRoleInput)
    .output(projectDetailSchema)
    .mutation(({ ctx, input }) => {
      return callProcedure(() => createRole(ctx.db, ctx.userId, input))
    }),

  update: bookerProcedure
    .input(updateRoleInput)
    .output(projectDetailSchema)
    .mutation(({ ctx, input }) => {
      return callProcedure(() => updateRole(ctx.db, ctx.userId, input))
    }),

  /**
   * Publishing feeds the open-roles board and needs a professionally verified booker, so it
   * stays closed until M7 (verification) and M9 (board) ship. No input path sets `is_published`.
   */
  publish: bookerProcedure.input(roleIdInput).mutation(() => {
    return callProcedure(async () => {
      throw new ProjectError(
        "Publishing roles opens with the open-roles board",
        "publish_unavailable",
      )
    })
  }),
})
