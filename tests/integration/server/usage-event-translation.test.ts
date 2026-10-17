import { describe, expect, test } from "bun:test"
import { reconcileCompletedUsage } from "../../../src/adapters/opencode/server/usage-reconciliation.js"
import { gameStateSchema } from "../../../src/application/contracts/game.js"

const state = gameStateSchema.parse({
  phase: "onboarding",
  message: "Choose a starter.",
  region: null,
  location: null,
  party: [1, 2, 3, 4, 5, 6].map((position) => ({ position, pokemon: null })),
  pendingChoices: [],
})

const completedMessage = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  type: "assistant",
  time: { completed: 1_790_640_000_000 },
  tokens: { input: 3, output: 4, reasoning: 2, cache: { read: 5, write: 1 } },
  ...overrides,
})

describe("OpenCode usage event translation", () => {
  test("translates each supported completion event and all completed-message token fields", async () => {
    // GIVEN
    const sessions: string[] = []
    const recorded: unknown[] = []
    const published: unknown[] = []
    const events = [
      { type: "session.execution.succeeded", data: { sessionID: "execution" } },
      { type: "session.idle", data: { sessionID: "idle" } },
      { type: "session.status", data: { sessionID: "status", status: { type: "idle" } } },
    ]

    // WHEN
    await reconcileCompletedUsage({
      event: {
        async *subscribe() {
          yield* events
        },
      },
      session: {
        async context({ sessionID }) {
          sessions.push(sessionID)
          return [completedMessage(`message-${sessionID}`)]
        },
      },
      recordUsage: (input) => {
        recorded.push(input)
        return { kind: "applied", state }
      },
      onUsageApplied: async (application) => {
        published.push(application)
      },
      signal: new AbortController().signal,
    })

    // THEN
    expect(sessions).toEqual(["execution", "idle", "status"])
    expect(recorded).toEqual(
      ["execution", "idle", "status"].map((sessionId) => ({
        sessionId,
        messageId: `message-${sessionId}`,
        inputTokens: 3,
        outputTokens: 4,
        reasoningTokens: 2,
        cacheReadTokens: 5,
        cacheWriteTokens: 1,
        completedAt: "2026-09-29T00:00:00.000Z",
      })),
    )
    expect(published).toHaveLength(3)
  })

  test("ignores irrelevant and malformed events/messages and publishes only newly applied usage", async () => {
    // GIVEN
    const recorded: string[] = []
    const published: string[] = []
    const dispositions = ["applied", "duplicate", "inactive", "frozen-discarded"] as const

    // WHEN
    await reconcileCompletedUsage({
      event: {
        async *subscribe() {
          yield { type: "session.execution.failed", data: { sessionID: "irrelevant" } }
          yield { type: "session.status", data: { sessionID: "session", status: { type: "busy" } } }
          yield { type: "session.idle", data: { sessionID: "session" } }
        },
      },
      session: {
        async context() {
          return [
            ...dispositions.map((kind) => completedMessage(kind)),
            { ...completedMessage("user"), type: "user" },
            { ...completedMessage("unfinished"), time: {} },
            { ...completedMessage("bad-tokens"), tokens: { input: -1 } },
          ]
        },
      },
      recordUsage: (input) => {
        recorded.push(input.messageId)
        const kind = dispositions.find((kind) => kind === input.messageId)
        if (kind === undefined) throw new Error(`Unexpected message: ${input.messageId}`)
        return { kind, state }
      },
      onUsageApplied: async () => {
        published.push("published")
      },
      signal: new AbortController().signal,
    })

    // THEN
    expect(recorded).toEqual([...dispositions])
    expect(published).toEqual(["published"])
  })

  test.each(["recording", "publication"] as const)("propagates %s errors", async (boundary) => {
    // GIVEN
    const dependencies = {
      event: {
        async *subscribe() {
          yield { type: "session.idle", data: { sessionID: "session" } }
        },
      },
      session: {
        async context() {
          return [completedMessage("message")]
        },
      },
      recordUsage: () => {
        if (boundary === "recording") throw new Error("usage transaction failed")
        return { kind: "applied" as const, state }
      },
      onUsageApplied: async () => {
        throw new Error("event publication failed")
      },
      signal: new AbortController().signal,
    }

    // WHEN
    const result = reconcileCompletedUsage(dependencies)

    // THEN
    await expect(result).rejects.toThrow(
      boundary === "recording" ? "usage transaction failed" : "event publication failed",
    )
  })
})
