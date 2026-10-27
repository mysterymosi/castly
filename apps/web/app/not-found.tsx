import Link from "next/link"

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="font-heading text-2xl font-semibold">Portfolio not found</h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        This page doesn’t exist, or the talent hasn’t published their portfolio.
      </p>
      <Link href="/" className="text-sm font-medium underline underline-offset-4">
        Go to Castly
      </Link>
    </main>
  )
}
