import {
  CARD_WIDTH,
  mediaMetaFromStatus as nativeMediaMeta,
  PortfolioMediaProvider,
  PortfolioPhoto,
  renderStudioSection,
  type PortfolioMediaComponents,
} from "@workspace/portfolio-native"
import type { FixturePortfolio } from "@workspace/portfolio-web/fixtures"
import {
  mediaMetaFromStatus as webMediaMeta,
  PortfolioSections,
} from "@workspace/portfolio-web"
import { layoutPortfolioPage, readVisibleSections, withShowablePhotos } from "@workspace/schema"
import { renderToStaticMarkup } from "react-dom/server"

import { extractSection, extractWebSections, isEmpty, type SemanticSection } from "./extract"

/** Native media slots as plain elements carrying their URLs, so media ids are extractable. */
const nativeMedia: PortfolioMediaComponents = {
  Image: ({ uri }) => <img src={uri} alt="" />,
  Video: ({ playbackUrl, posterUrl }) => (
    <video src={playbackUrl} poster={posterUrl ?? undefined} />
  ),
}

/**
 * Native: each visible section in shared order with the photos spread between them, rendered as
 * the card list renders them. Photos the media map lacks are left out, as on the web.
 */
export function nativeSemantics(portfolio: FixturePortfolio): SemanticSection[] {
  const mediaMeta = nativeMediaMeta(portfolio.media)
  // Native media meta keeps unready media (no URL); only photos with an image URL show.
  const content = withShowablePhotos(portfolio.content, (id) => Boolean(mediaMeta[id]?.imageUrl))
  const photos = content.photoMediaIds ?? []
  return layoutPortfolioPage(readVisibleSections(portfolio.sections), photos)
    .map((item) => {
      const html = renderToStaticMarkup(
        <PortfolioMediaProvider components={nativeMedia}>
          {item.kind === "section"
            ? renderStudioSection(item.section, mediaMeta, CARD_WIDTH, {
                content,
                now: portfolio.now,
              })
            : (
                <PortfolioPhoto
                  mediaId={item.mediaId}
                  mediaMeta={mediaMeta}
                  index={item.index}
                  photoMediaIds={photos}
                />
              )}
        </PortfolioMediaProvider>
      )
      return extractSection(item.kind === "section" ? item.section.type : "photo", html)
    })
    .filter((section) => !isEmpty(section))
}

/** Web: the whole stacked page, split by section shell. */
export function webSemantics(portfolio: FixturePortfolio): SemanticSection[] {
  const html = renderToStaticMarkup(
    <PortfolioSections
      sections={readVisibleSections(portfolio.sections)}
      mediaMeta={webMediaMeta(portfolio.media)}
      content={portfolio.content}
      now={portfolio.now}
    />
  )
  return extractWebSections(html).filter((section) => !isEmpty(section))
}
