import { ZodError } from "zod"

export type ZodErrorShape = {
  formErrors: string[]
  fieldErrors: Record<string, string[]>
}

type SchemaIssue = {
  message: string
  path?: ReadonlyArray<PropertyKey | { key: PropertyKey }>
}

function isStandardSchemaError(
  cause: unknown
): cause is Error & { issues: readonly SchemaIssue[] } {
  if (
    !(cause instanceof Error) ||
    cause.name !== "SchemaError" ||
    !("issues" in cause)
  )
    return false
  return Array.isArray(cause.issues)
}

function pathKey(path: SchemaIssue["path"]) {
  return (path ?? [])
    .map((segment) => {
      if (typeof segment === "object" && segment !== null && "key" in segment)
        return segment.key
      return segment
    })
    .map((segment) => String(segment))
    .join(".")
}

/** Field errors for the client. Zod 4 is parsed as ZodError; Standard Schema failures use SchemaError. */
export function zodErrorShape(cause: unknown): ZodErrorShape | null {
  if (cause instanceof ZodError) {
    const flat = cause.flatten()
    const fieldErrors: Record<string, string[]> = {}
    for (const [field, messages] of Object.entries(flat.fieldErrors)) {
      if (!Array.isArray(messages)) continue
      const lines = messages.filter(
        (message): message is string => typeof message === "string"
      )
      if (lines.length > 0) fieldErrors[field] = lines
    }
    return { formErrors: flat.formErrors, fieldErrors }
  }

  if (!isStandardSchemaError(cause)) return null

  const formErrors: string[] = []
  const fieldErrors: Record<string, string[]> = {}
  for (const issue of cause.issues) {
    const key = pathKey(issue.path)
    if (!key) {
      formErrors.push(issue.message)
      continue
    }
    fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message]
  }
  return { formErrors, fieldErrors }
}
