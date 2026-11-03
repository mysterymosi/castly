import Link from "next/link"

import { signOut } from "@/app/sign-in/actions"
import { requireAdmin } from "@/lib/auth"

const nav = [
  { href: "/deck", label: "Deck inspector" },
  { href: "/ranking", label: "Ranking settings" },
]

export default async function ConsoleLayout({ children }: LayoutProps<"/">) {
  const me = await requireAdmin()
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b px-6 py-3 text-sm">
        <Link href="/" className="font-medium">
          Castly ops
        </Link>
        <nav className="flex gap-4">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="text-muted-foreground hover:text-foreground">
              {item.label}
            </Link>
          ))}
        </nav>
        <form action={signOut} className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span>{me.email}</span>
          <button type="submit" className="underline-offset-4 hover:text-foreground hover:underline">
            Sign out
          </button>
        </form>
      </header>
      <main className="flex flex-1 flex-col gap-6 px-6 py-6">{children}</main>
    </div>
  )
}
