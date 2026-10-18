export class PortfolioSectionValidationError extends Error {
  readonly code = "PORTFOLIO_SECTION_VALIDATION"

  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = "PortfolioSectionValidationError"
  }
}
