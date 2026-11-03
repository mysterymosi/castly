import type { DeckCard } from "@workspace/schema"
import { Image } from "expo-image"
import { useEffect } from "react"

import { mediaUri } from "@/deck/deck-card"
import { useDataSaver } from "@/media/data-saver"

/** Cards ahead of the focused one whose decision layer (lead photo) is fetched early. */
export const DECISION_PREFETCH_AHEAD = 5

/** The decision layer's image: the first lead photo, or a video's poster. */
export function decisionLayerUrls(card: DeckCard): string[] {
  const lead = card.decision.leadMediaIds[0]
  const uri = lead ? mediaUri(card, lead) : null
  return uri ? [uri] : []
}

/**
 * The depth layer's images: every section photo at card size and every video's poster. Never a
 * stream — a showreel's HLS loads only when it plays (`PortfolioVideoGate`).
 */
export function depthLayerUrls(card: DeckCard): string[] {
  return Object.values(card.media).flatMap((media) =>
    media.kind === "image"
      ? media.variants?.card
        ? [media.variants.card]
        : []
      : media.posterUrl
        ? [media.posterUrl]
        : [],
  )
}

/**
 * Image URLs to warm for the deck at `index` (TECH_SPEC §10.2): decision layers ahead, and depth
 * for n+1 unless data-saver is on (then a portfolio's images load only once it is scrolled).
 */
export function prefetchUrls(cards: DeckCard[], index: number, { depth = true } = {}): string[] {
  const ahead = cards.slice(index + 1, index + 1 + DECISION_PREFETCH_AHEAD)
  const next = depth ? cards[index + 1] : undefined
  return [...new Set([...ahead.flatMap(decisionLayerUrls), ...(next ? depthLayerUrls(next) : [])])]
}

// URLs already handed to the image cache this run; a card moving closer doesn't refetch them.
const requested = new Set<string>()

/** Warms the image cache as the focused card moves. Fire and forget: a failed prefetch just loads later. */
export function useDeckPrefetch(cards: DeckCard[], index: number) {
  const dataSaver = useDataSaver()
  useEffect(() => {
    const urls = prefetchUrls(cards, index, { depth: !dataSaver }).filter((url) => !requested.has(url))
    if (urls.length === 0) return
    for (const url of urls) requested.add(url)
    void Image.prefetch(urls, "memory-disk").catch(() => {
      for (const url of urls) requested.delete(url)
    })
  }, [cards, index, dataSaver])
}
