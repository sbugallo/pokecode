import { describe, expect, test } from "bun:test"
import {
  experienceFromTokens,
  receiptDisposition,
  totalTokens,
  usageReceiptKey,
} from "../../../../../src/domain/usage/usage.js"

describe("usage rules", () => {
  test("totals every token category and preserves fractional experience", () => {
    // GIVEN
    const usage = {
      inputTokens: 10,
      outputTokens: 20,
      reasoningTokens: 30,
      cacheReadTokens: 40,
      cacheWriteTokens: 50,
    }

    // WHEN
    const tokens = totalTokens(usage)
    const experience = experienceFromTokens(tokens, { xpTokensPerPoint: 100 })

    // THEN
    expect(tokens).toBe(150)
    expect(experience).toBe(1.5)
  })

  test("identifies a receipt by both session and message", () => {
    // GIVEN
    const receipt = { sessionId: "session-a", messageId: "message-1" }

    // WHEN
    const key = usageReceiptKey(receipt)

    // THEN
    expect(key).toBe("session-a:message-1")
  })

  test.each([
    {
      name: "a duplicate remains duplicate even if inactive and frozen",
      input: { duplicate: true, active: false, frozen: true },
      expected: "duplicate",
    },
    {
      name: "a new receipt without an active trainer is inactive",
      input: { duplicate: false, active: false, frozen: true },
      expected: "inactive",
    },
    {
      name: "a new receipt during a pending choice is discarded",
      input: { duplicate: false, active: true, frozen: true },
      expected: "frozen-discarded",
    },
    {
      name: "an active unfrozen receipt is applied",
      input: { duplicate: false, active: true, frozen: false },
      expected: "applied",
    },
  ] as const)("$name", ({ input, expected }) => {
    // GIVEN
    // WHEN
    const result = receiptDisposition(input)

    // THEN
    expect(result).toBe(expected)
  })
})
