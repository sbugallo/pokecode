import { test } from "bun:test"
import { testRender } from "@opentui/solid"
import type { PokemonTuiRpcTransport } from "../../src/adapters/opencode/tui/client.js"
import { createPokemonTuiClient } from "../../src/adapters/opencode/tui/client.js"
import { type GameState, gameStateSchema } from "../../src/application/contracts/game.js"

type TestRenderer = Awaited<ReturnType<typeof testRender>>
const activeRenderers = new Set<TestRenderer>()
let rendererTurn = Promise.resolve()

async function runSerializedTuiTest(run: () => void | Promise<void>) {
  const previousTurn = rendererTurn
  let releaseTurn!: () => void
  rendererTurn = new Promise<void>((resolve) => {
    releaseTurn = resolve
  })
  await previousTurn
  const failures: unknown[] = []
  let testFailure: unknown
  let didTestFail = false
  try {
    await run()
  } catch (error) {
    didTestFail = true
    testFailure = error
  }
  for (const rendered of activeRenderers) {
    try {
      rendered.renderer.destroy()
    } catch (error) {
      failures.push(error)
    }
  }
  activeRenderers.clear()
  releaseTurn()
  if (didTestFail) {
    if (failures.length > 0) {
      throw new AggregateError([testFailure, ...failures], "TUI test and renderer cleanup failed", {
        cause: testFailure,
      })
    }
    throw testFailure
  }
  if (failures.length === 1) throw failures[0]
  if (failures.length > 1) throw new AggregateError(failures, "TUI renderers failed to close")
}

export function testTui(name: string, run: () => void | Promise<void>) {
  test(name, () => runSerializedTuiTest(run))
}

export function testTuiEach<Case>(
  cases: readonly Case[],
  nameFor: (value: Case) => string,
  run: (value: Case) => void | Promise<void>,
) {
  for (const value of cases) testTui(nameFor(value), () => run(value))
}

export async function renderTui(
  node: Parameters<typeof testRender>[0],
  options: Parameters<typeof testRender>[1] = {},
) {
  const rendered = await testRender(node, options)
  activeRenderers.add(rendered)
  return rendered
}

const unimplemented = async (_input?: unknown): Promise<unknown> => {
  throw new Error("Unexpected fake TUI RPC call")
}

export function makeTuiRpcTransport(
  overrides: Partial<PokemonTuiRpcTransport> = {},
): PokemonTuiRpcTransport {
  const transport: PokemonTuiRpcTransport = {
    status: unimplemented,
    chooseStarter: unimplemented,
    travelTo: unimplemented,
    travelToRegion: unimplemented,
    catchEncounter: unimplemented,
    runEncounter: unimplemented,
    collection: unimplemented,
    dex: unimplemented,
    exportTeam: unimplemented,
    sprite: unimplemented,
    replaceParty: unimplemented,
    renamePokemon: unimplemented,
    releasePokemon: unimplemented,
    resolveMoveChoice: unimplemented,
    resolveEvolutionChoice: unimplemented,
    dismissNextRegionChoice: unimplemented,
    reopenNextRegionChoice: unimplemented,
    events: { on: () => () => {} },
  }
  return { ...transport, ...overrides }
}

export function makeTuiClient(overrides: Partial<PokemonTuiRpcTransport> = {}) {
  return createPokemonTuiClient(makeTuiRpcTransport(overrides))
}

export function makeTuiState(input: Record<string, unknown> = {}): GameState {
  return gameStateSchema.parse({
    phase: "active",
    message: "Ready",
    region: "kanto",
    location: "pallet-town",
    party: [1, 2, 3, 4, 5, 6].map((position) => ({ position, pokemon: null })),
    pendingChoices: [],
    pendingEncounterCount: 0,
    choicePokemon: [],
    exploration: null,
    ...input,
  })
}

export function deferred<Value>() {
  let resolve!: (value: Value) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<Value>((accept, fail) => {
    resolve = accept
    reject = fail
  })
  return { promise, resolve, reject }
}
