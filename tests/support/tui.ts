import { test } from "bun:test"
import { RGBA } from "@opentui/core"
import { testRender } from "@opentui/solid"
import type { PokemonTuiRpcTransport } from "../../src/adapters/opencode/tui/client.js"
import { createPokemonTuiClient } from "../../src/adapters/opencode/tui/client.js"
import type {
  PokecodeResolvedTheme,
  PokecodeSurface,
  PokecodeTheme,
} from "../../src/adapters/opencode/tui/theme.js"
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

type SurfaceColorName =
  | "text"
  | "muted"
  | "accent"
  | "success"
  | "error"
  | "info"
  | "background"
  | "raised"
  | "highlight"
  | "border"

type SurfaceColorOverrides = Partial<Record<SurfaceColorName, string>>

const surfaceColors: Record<SurfaceColorName, string> = {
  text: "#eeeeee",
  muted: "#808080",
  accent: "#a78bfa",
  success: "#7fd88f",
  error: "#e06c75",
  info: "#56b6c2",
  background: "#1e1e1e",
  raised: "#282828",
  highlight: "#3c3c3c",
  border: "#484848",
}

const transparent = RGBA.fromInts(0, 0, 0, 0)

/** Pokecode surface tokens with predictable colors for rendering tests. */
export function makePokecodeSurface(overrides: SurfaceColorOverrides = {}): PokecodeSurface {
  const color = (name: SurfaceColorName) => RGBA.fromHex(overrides[name] ?? surfaceColors[name])
  const action = (label: string, background: string, backgroundHovered: string) => ({
    background: RGBA.fromHex(background),
    backgroundHovered: RGBA.fromHex(backgroundHovered),
    label: RGBA.fromHex(label),
    labelHovered: color("text"),
  })
  return {
    text: color("text"),
    muted: color("muted"),
    accent: color("accent"),
    success: color("success"),
    error: color("error"),
    info: color("info"),
    background: color("background"),
    raised: color("raised"),
    highlight: color("highlight"),
    border: color("border"),
    primary: action(overrides.text ?? surfaceColors.text, "#204060", "#2a5080"),
    secondary: action(overrides.muted ?? surfaceColors.muted, "#505050", "#606060"),
  }
}

export function makePokecodeTheme(overrides: SurfaceColorOverrides = {}): PokecodeTheme {
  const current = makePokecodeSurface(overrides)
  return { current, dialog: current }
}

/** Structural mock of the host resolved theme for wiring tests. */
export function makeResolvedTheme(overrides: SurfaceColorOverrides = {}): PokecodeResolvedTheme {
  const color = (name: SurfaceColorName) => RGBA.fromHex(overrides[name] ?? surfaceColors[name])
  const stateful = (base: ReturnType<typeof color>) => ({
    base,
    state: () => base,
  })
  const theme: PokecodeResolvedTheme = {
    hue: { accent: { 200: color("accent") } },
    text: {
      base: color("text"),
      muted: color("muted"),
      action: {
        primary: stateful(color("text")),
        secondary: stateful(color("muted")),
      },
      feedback: {
        error: { base: color("error") },
        success: { base: color("success") },
        info: { base: color("info") },
      },
    },
    background: {
      base: color("background"),
      raised: { base: color("raised"), max: color("highlight") },
      action: {
        primary: stateful(transparent),
        secondary: stateful(transparent),
      },
    },
    border: { base: color("border") },
    surface: () => theme,
  }
  return theme
}
