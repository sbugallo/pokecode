import { afterEach, describe, expect, test } from "bun:test"
import { setupPokecodeServer } from "../../../src/adapters/opencode/server/plugin.js"
import { openGameRepository } from "../../../src/adapters/sqlite/game-repository.js"
import type { GameState } from "../../../src/application/contracts/game.js"
import { gameStateSchema } from "../../../src/application/contracts/game.js"
import type { GameService } from "../../../src/application/game.js"

const state: GameState = gameStateSchema.parse({
  phase: "onboarding",
  locale: "en",
  message: "Choose a starter.",
  region: null,
  location: null,
  party: [1, 2, 3, 4, 5, 6].map((position) => ({ position, pokemon: null })),
  pendingChoices: [],
  pendingEncounter: null,
  exploration: null,
})

const repositoryCleanups: (() => void)[] = []

afterEach(() => {
  const failures: unknown[] = []
  for (const close of repositoryCleanups.splice(0)) {
    try {
      close()
    } catch (error) {
      failures.push(error)
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, "Failed to close lifecycle test repositories.")
  }
})

function fixture(
  eventStream: (
    signal: AbortSignal,
    order: string[],
  ) => AsyncIterable<{
    readonly type: string
    readonly data: unknown
  }>,
  registration: () => Promise<unknown> = async () => ({
    events: { emit: async () => {} },
    dispose: async () => {},
  }),
) {
  const order: string[] = []
  const repository = openGameRepository(":memory:")
  const originalClose = repository.close
  let closed = false
  const closeOriginal = () => {
    if (closed) return
    originalClose()
    closed = true
  }
  repositoryCleanups.push(closeOriginal)
  repository.close = () => {
    if (closed) return
    order.push("database-closed")
    closeOriginal()
  }
  const context = {
    options: { language: "en" },
    rpc: { register: async () => registration() },
    event: {
      subscribe: ({ signal }: { readonly signal: AbortSignal }) => eventStream(signal, order),
    },
    session: { context: async () => [] },
  } as unknown as Parameters<typeof setupPokecodeServer>[0]
  const dependencies = {
    openRepository: () => repository,
    createGame: () =>
      ({
        status: () => state,
        recordUsage: () => ({ kind: "applied", state }),
      }) as unknown as GameService,
    createSprites: () => ({ resolve: async () => ({ kind: "placeholder" as const }) }),
    random: () => 0,
    createId: () => "command-id",
    createStarterIds: () => ({ trainerId: "trainer-id", pokemonId: "pokemon-id" }),
    now: () => "2026-10-15T00:00:00.000Z",
  }
  return { context, dependencies, order }
}

describe("OpenCode server lifecycle", () => {
  test("awaits the aborted usage stream before closing SQLite", async () => {
    // GIVEN
    const { context, dependencies, order } = fixture(async function* (signal, order) {
      try {
        await new Promise<void>((resolve) => {
          if (signal.aborted) resolve()
          else signal.addEventListener("abort", () => resolve(), { once: true })
        })
      } finally {
        order.push("stream-stopped")
      }
    })
    let cleanup: Awaited<ReturnType<typeof setupPokecodeServer>> | undefined

    // WHEN
    try {
      cleanup = await setupPokecodeServer(context, dependencies)
      await Promise.resolve()
      const dispose = cleanup
      cleanup = undefined
      await dispose()

      // THEN
      expect(order).toEqual(["stream-stopped", "database-closed"])
    } finally {
      if (cleanup !== undefined) await cleanup()
    }
  })

  test("closes SQLite when RPC registration fails and preserves the failure", async () => {
    // GIVEN
    const { context, dependencies, order } = fixture(
      async function* () {},
      async () => {
        throw new Error("registration failed")
      },
    )

    // WHEN
    const setup = setupPokecodeServer(context, dependencies)

    // THEN
    await expect(setup).rejects.toThrow("registration failed")
    expect(order).toEqual(["database-closed"])
  })

  test("reports reconciliation failure after closing SQLite", async () => {
    // GIVEN
    const { context, dependencies, order } = fixture(async function* () {
      yield { type: "irrelevant", data: {} }
      throw new Error("event stream failed")
    })
    const cleanup = await setupPokecodeServer(context, dependencies)

    // WHEN
    const shutdown = cleanup()

    // THEN
    await expect(shutdown).rejects.toThrow("event stream failed")
    expect(order).toEqual(["database-closed"])
  })
})
