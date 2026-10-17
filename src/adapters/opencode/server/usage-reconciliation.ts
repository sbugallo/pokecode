import { z } from "zod"
import type { UsageApplication, UsageInput } from "../../../application/contracts/game.js"

const completedSessionEventSchema = z.union([
  z.object({
    type: z.enum(["session.execution.succeeded", "session.idle"]),
    data: z.object({
      sessionID: z.string().min(1),
    }),
  }),
  z.object({
    type: z.literal("session.status"),
    data: z.object({
      sessionID: z.string().min(1),
      status: z.object({ type: z.literal("idle") }),
    }),
  }),
])

const completedAssistantMessageSchema = z.object({
  id: z.string().min(1),
  type: z.literal("assistant"),
  time: z.object({
    completed: z.number().finite(),
  }),
  tokens: z.object({
    input: z.number().int().nonnegative(),
    output: z.number().int().nonnegative(),
    reasoning: z.number().int().nonnegative(),
    cache: z.object({
      read: z.number().int().nonnegative(),
      write: z.number().int().nonnegative(),
    }),
  }),
})

type UsageEventSource = {
  subscribe(options: { readonly signal: AbortSignal }): AsyncIterable<{
    readonly type: string
    readonly data: unknown
  }>
}

type UsageSessionSource = {
  context(input: { readonly sessionID: string }): Promise<readonly unknown[]>
}

type UsageReconciliationDependencies = {
  readonly event: UsageEventSource
  readonly session: UsageSessionSource
  readonly recordUsage: (input: UsageInput) => UsageApplication
  readonly onUsageApplied: (application: UsageApplication) => Promise<void>
  readonly signal: AbortSignal
}

export async function reconcileCompletedUsage(
  dependencies: UsageReconciliationDependencies,
): Promise<void> {
  for await (const event of dependencies.event.subscribe({ signal: dependencies.signal })) {
    const completedEvent = completedSessionEventSchema.safeParse(event)
    if (!completedEvent.success) continue
    const messages = await dependencies.session.context({
      sessionID: completedEvent.data.data.sessionID,
    })
    for (const message of messages) {
      const completedMessage = completedAssistantMessageSchema.safeParse(message)
      if (!completedMessage.success) continue
      const application = dependencies.recordUsage({
        sessionId: completedEvent.data.data.sessionID,
        messageId: completedMessage.data.id,
        inputTokens: completedMessage.data.tokens.input,
        outputTokens: completedMessage.data.tokens.output,
        reasoningTokens: completedMessage.data.tokens.reasoning,
        cacheReadTokens: completedMessage.data.tokens.cache.read,
        cacheWriteTokens: completedMessage.data.tokens.cache.write,
        completedAt: new Date(completedMessage.data.time.completed).toISOString(),
      })
      if (application.kind === "applied") await dependencies.onUsageApplied(application)
    }
  }
}
