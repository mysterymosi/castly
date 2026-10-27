import {
  CARD_WIDTH,
  mediaMetaFromStatus as nativeMediaMeta,
  PortfolioMediaProvider,
  renderStudioSection,
  type PortfolioMediaComponents,
} from "@workspace/portfolio-native"
import type { FixturePortfolio } from "@workspace/portfolio-web/fixtures"
import {
  mediaMetaFromStatus as webMediaMeta,
  PortfolioSections,
} from "@workspace/portfolio-web"
import { readVisibleSections } from "@workspace/schema"
import { renderToStaticMarkup } from "react-dom/server"

import { extractSection, extractWebSections, isEmpty, type SemanticSection } from "./extract"

/** Native media slots as plain elements carrying their URLs, so media ids are extractable. */
const nativeMedia: PortfolioMediaComponents = {
  Image: ({ uri }) => <img src={uri} alt="" />,
  Video: ({ playbackUrl, posterUrl }) => (
    <video src={playbackUrl} poster={posterUrl ?? undefined} />
  ),
}

/** Native: each visible section in shared order, rendered as the card list renders it. */
export function nativeSemantics(portfolio: FixturePortfolio): SemanticSection[] {
  const mediaMeta = nativeMediaMeta(portfolio.media)
  return readVisibleSections(portfolio.sections)
    .map((section) => {
      const html = renderToStaticMarkup(
        <PortfolioMediaProvider components={nativeMedia}>
          {renderStudioSection(section, mediaMeta, CARD_WIDTH, {
            content: portfolio.content,
            now: portfolio.now,
          })}
        </PortfolioMediaProvider>
      )
      return extractSection(section.type, html)
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
