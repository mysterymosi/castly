export type ProjectErrorCode =
  | "project_not_found"
  | "role_not_found"
  | "project_archived"
  | "booker_profile_required"
  | "unknown_category"
  | "invalid_requirement"
  | "sensitive_requires_brief"
  | "publish_unavailable"

export class ProjectError extends Error {
  readonly code: ProjectErrorCode

  constructor(message: string, code: ProjectErrorCode) {
    super(message)
    this.name = "ProjectError"
    this.code = code
  }
}
