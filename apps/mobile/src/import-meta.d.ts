// The mobile typecheck follows `import type { AppRouter }` into the API, which uses Node's
// `import.meta.dirname`. Expo's module setting does not declare that field.
interface ImportMeta {
  dirname: string
  filename: string
}
