import Link from "next/link"

const tools = [
  {
    href: "/deck",
    title: "Deck inspector",
    body: "Run a booker's deck without touching it, or open one of their sessions, and see why each card ranked where it did.",
  },
  {
    href: "/ranking",
    title: "Ranking settings",
    body: "The deck's scoring weights and fairness settings. Changes are live within a minute, no deploy.",
  },
]

export default function ConsoleHome() {
  return (
    <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
      {tools.map((tool) => (
        <Link key={tool.href} href={tool.href} className="flex flex-col gap-1 rounded-lg border p-4 hover:bg-muted/50">
          <span className="text-sm font-medium">{tool.title}</span>
          <span className="text-xs text-muted-foreground">{tool.body}</span>
        </Link>
      ))}
    </div>
  )
}
