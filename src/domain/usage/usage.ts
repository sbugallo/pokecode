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

/** Fixed rate the unlock curve was calibrated against: 1000 tokens = 1 XP. */
export const tokensPerExperiencePoint = 1_000

export function experienceFromTokens(tokenCount: number): number {
  return tokenCount / tokensPerExperiencePoint
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
