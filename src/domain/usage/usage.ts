export type TokenUsage = {
  readonly inputTokens: number
  readonly outputTokens: number
  readonly reasoningTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
}

export function totalTokens(input: TokenUsage): number {
  return (
    input.inputTokens +
    input.outputTokens +
    input.reasoningTokens +
    input.cacheReadTokens +
    input.cacheWriteTokens
  )
}

export function experienceFromTokens(
  tokenCount: number,
  config: { readonly xpTokensPerPoint: number },
): number {
  return tokenCount / config.xpTokensPerPoint
}

export function usageReceiptKey(input: {
  readonly sessionId: string
  readonly messageId: string
}): string {
  return `${input.sessionId}:${input.messageId}`
}

export function receiptDisposition(input: {
  readonly duplicate: boolean
  readonly active: boolean
  readonly frozen: boolean
}): "duplicate" | "inactive" | "frozen-discarded" | "applied" {
  if (input.duplicate) return "duplicate"
  if (!input.active) return "inactive"
  if (input.frozen) return "frozen-discarded"
  return "applied"
}
