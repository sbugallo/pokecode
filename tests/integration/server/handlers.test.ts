import { describe, expect, test } from "bun:test"
import { createPokecodeHandlers } from "../../../src/adapters/opencode/server/handlers.js"
import {
  localizeCollection,
  localizeDex,
  localizeGameState,
} from "../../../src/adapters/presentation/localization.js"
import {
  type GameState,
  gameStateSchema,
  type PokemonCollection,
  type PokemonDex,
  pokemonDexSchema,
} from "../../../src/application/contracts/game.js"
import type { GameService } from "../../../src/application/game.js"
import { pokemonInstanceSchema } from "../../../src/domain/pokemon/model.js"

const state: GameState = gameStateSchema.parse({
  phase: "active",
  locale: "en",
  message: "Ready",
  region: "kanto",
  location: "pallet-town",
  party: [1, 2, 3, 4, 5, 6].map((position) => ({ position, pokemon: null })),
  pendingChoices: [],
  pendingEncounter: null,
  exploration: {
    locations: [{ id: "pallet-town", name: "Pallet Town", unlocked: true, encounterless: true }],
    locationUnlockProgress: 0,
    locationUnlockThreshold: 100_000,
    regionComplete: false,
  },
})

const bulbasaur = pokemonInstanceSchema.parse({
  id: "3a858b70-5e3e-4b97-ae41-19b1f0ad05c5",
  speciesId: "bulbasaur",
  name: "Bulbasaur",
  gender: "male",
  level: 5,
  experience: 0,
  ability: "Overgrow",
  nature: "Hardy",
  shiny: false,
  ivs: { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 },
  evs: { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 },
  moves: [{ id: "vine-whip", name: "Vine Whip" }],
})
const collection: PokemonCollection = { pokemon: [bulbasaur] }
const dex: PokemonDex = pokemonDexSchema.parse({
  discoveries: [{ speciesId: "bulbasaur", status: "caught" }],
  pokemon: [{ number: 1, speciesId: "bulbasaur", name: "Bulbasaur", status: "caught" }],
})

type HandlerSet = ReturnType<typeof createPokecodeHandlers>
type HandlerContext = Parameters<HandlerSet["status"]>[1]
type HandlerRoute = {
  readonly name: string
  readonly expectedMethod: string
  readonly expectedArguments: readonly unknown[]
  readonly resultKind?: string
  readonly invoke: (handlers: HandlerSet, context: HandlerContext) => Promise<unknown>
}

function makeHandlers(
  game: Partial<GameService>,
  options: {
    readonly localizeState?: (state: GameState) => GameState
    readonly publish?: (state: GameState) => Promise<void>
  } = {},
) {
  const publicationAttempts: GameState[] = []
  const published: GameState[] = []
  const handlers = createPokecodeHandlers({
    game: game as GameService,
    localizers: {
      state: options.localizeState ?? ((nextState) => localizeGameState(nextState, "es")),
      collection: (nextCollection) => localizeCollection(nextCollection, "es"),
      dex: (nextDex) => localizeDex(nextDex, "es"),
    },
    sprites: { resolve: async () => ({ kind: "placeholder" }) },
    publishStatusChanged: async (nextState) => {
      publicationAttempts.push(nextState)
      await options.publish?.(nextState)
      published.push(nextState)
    },
  })
  const context = {} as HandlerContext
  return { handlers, context, publicationAttempts, published }
}

function routeGame(calls: { method: string; arguments: readonly unknown[] }[]): GameService {
  const result = (method: string, args: readonly unknown[], kind: string) => {
    calls.push({ method, arguments: args })
    return { kind, state: { ...state, message: `${method} result` } }
  }
  const directState = (method: string) => {
    calls.push({ method, arguments: [] })
    return { ...state, message: `${method} result` }
  }
  return {
    chooseStarter: (regionId: string, speciesId: string) =>
      result("chooseStarter", [regionId, speciesId], "invalid-starter"),
    travelTo: (locationId: string) => result("travelTo", [locationId], "teleported"),
    travelToRegion: (regionId: string) => result("travelToRegion", [regionId], "region-incomplete"),
    catchEncounter: (encounterId: string) =>
      result("catchEncounter", [encounterId], "no-encounter"),
    runEncounter: (encounterId: string) => result("runEncounter", [encounterId], "ran"),
    replaceParty: (pokemonIds: readonly string[]) =>
      result("replaceParty", [pokemonIds], "invalid-party"),
    resolveMoveChoice: (choiceId: string, selectedMoveId: string) =>
      result("resolveMoveChoice", [choiceId, selectedMoveId], "invalid-choice"),
    resolveEvolutionChoice: (choiceId: string, selectedSpeciesId: string) =>
      result("resolveEvolutionChoice", [choiceId, selectedSpeciesId], "invalid-choice"),
    dismissNextRegionChoice: () => directState("dismissNextRegionChoice"),
    reopenNextRegionChoice: () => directState("reopenNextRegionChoice"),
  } as unknown as GameService
}

const commandRoutes = [
  {
    name: "starter selection",
    expectedMethod: "chooseStarter",
    expectedArguments: ["kanto", "missing"],
    resultKind: "invalid-starter",
    invoke: (handlers, context) =>
      handlers.chooseStarter({ regionId: "kanto", speciesId: "missing" }, context),
  },
  {
    name: "location travel",
    expectedMethod: "travelTo",
    expectedArguments: ["route-1"],
    resultKind: "teleported",
    invoke: (handlers, context) => handlers.travelTo({ locationId: "route-1" }, context),
  },
  {
    name: "region travel",
    expectedMethod: "travelToRegion",
    expectedArguments: ["johto"],
    resultKind: "region-incomplete",
    invoke: (handlers, context) => handlers.travelToRegion({ regionId: "johto" }, context),
  },
  {
    name: "catch attempt",
    expectedMethod: "catchEncounter",
    expectedArguments: ["a058c8b8-6638-42d3-84a6-ea3f5f8d5003"],
    resultKind: "no-encounter",
    invoke: (handlers, context) =>
      handlers.catchEncounter({ encounterId: "a058c8b8-6638-42d3-84a6-ea3f5f8d5003" }, context),
  },
  {
    name: "run attempt",
    expectedMethod: "runEncounter",
    expectedArguments: ["a058c8b8-6638-42d3-84a6-ea3f5f8d5003"],
    resultKind: "ran",
    invoke: (handlers, context) =>
      handlers.runEncounter({ encounterId: "a058c8b8-6638-42d3-84a6-ea3f5f8d5003" }, context),
  },
  {
    name: "party replacement",
    expectedMethod: "replaceParty",
    expectedArguments: [["a058c8b8-6638-42d3-84a6-ea3f5f8d5003"]],
    resultKind: "invalid-party",
    invoke: (handlers, context) =>
      handlers.replaceParty({ pokemonIds: ["a058c8b8-6638-42d3-84a6-ea3f5f8d5003"] }, context),
  },
  {
    name: "move choice resolution",
    expectedMethod: "resolveMoveChoice",
    expectedArguments: ["a058c8b8-6638-42d3-84a6-ea3f5f8d5003", "unknown-move"],
    resultKind: "invalid-choice",
    invoke: (handlers, context) =>
      handlers.resolveMoveChoice(
        { choiceId: "a058c8b8-6638-42d3-84a6-ea3f5f8d5003", selectedMoveId: "unknown-move" },
        context,
      ),
  },
  {
    name: "evolution choice resolution",
    expectedMethod: "resolveEvolutionChoice",
    expectedArguments: ["a058c8b8-6638-42d3-84a6-ea3f5f8d5003", "unknown-species"],
    resultKind: "invalid-choice",
    invoke: (handlers, context) =>
      handlers.resolveEvolutionChoice(
        {
          choiceId: "a058c8b8-6638-42d3-84a6-ea3f5f8d5003",
          selectedSpeciesId: "unknown-species",
        },
        context,
      ),
  },
  {
    name: "region-choice dismissal",
    expectedMethod: "dismissNextRegionChoice",
    expectedArguments: [],
    invoke: (handlers, context) => handlers.dismissNextRegionChoice({}, context),
  },
  {
    name: "region-choice reopening",
    expectedMethod: "reopenNextRegionChoice",
    expectedArguments: [],
    invoke: (handlers, context) => handlers.reopenNextRegionChoice({}, context),
  },
] satisfies readonly HandlerRoute[]

describe("OpenCode server request handlers", () => {
  test.each(commandRoutes)("forwards $name and publishes its localized result", async (route) => {
    // GIVEN
    const calls: { method: string; arguments: readonly unknown[] }[] = []
    const { handlers, context, published } = makeHandlers(routeGame(calls))

    // WHEN
    const output = await route.invoke(handlers, context)

    // THEN
    expect(calls).toEqual([{ method: route.expectedMethod, arguments: route.expectedArguments }])
    if (route.resultKind === undefined) {
      const localizedState = output as GameState
      expect(localizedState).toMatchObject({
        locale: "es",
        message: `${route.expectedMethod} result`,
      })
      expect(published).toEqual([localizedState])
    } else {
      const result = output as { readonly kind: string; readonly state: GameState }
      expect(result.kind).toBe(route.resultKind)
      expect(result.state).toMatchObject({
        locale: "es",
        message: `${route.expectedMethod} result`,
      })
      expect(published).toEqual([result.state])
    }
  })

  test("localizes read-model responses while keeping export and sprite responses distinct", async () => {
    // GIVEN
    const { handlers, context, published } = makeHandlers({
      status: () => state,
      collection: () => collection,
      dex: () => dex,
      exportTeam: () => ({ kind: "exported", text: "Bulbasaur" }),
    })

    // WHEN
    const status = await handlers.status({}, context)
    const collectionResult = await handlers.collection({}, context)
    const dexResult = await handlers.dex({}, context)
    const exportResult = await handlers.exportTeam({}, context)
    const spriteResult = await handlers.sprite(
      { speciesId: "pyroar", shiny: true, gender: "female" },
      context,
    )

    // THEN
    expect(status).toMatchObject({
      locale: "es",
      exploration: { locations: [{ name: "Pueblo Paleta" }] },
    })
    expect(collectionResult).toMatchObject({
      pokemon: [{ ability: "Espesura", moves: [{ name: "Látigo Cepa" }] }],
    })
    expect(String(pokemonDexSchema.parse(dexResult).pokemon[0]?.speciesId)).toBe("bulbasaur")
    expect(exportResult).toEqual({ kind: "exported", text: "Bulbasaur" })
    expect(spriteResult).toEqual({ kind: "placeholder" })
    expect(published).toEqual([])
  })

  test("does not publish after malformed input or application failure", async () => {
    // GIVEN
    const { handlers, context, published, publicationAttempts } = makeHandlers({
      travelTo: () => {
        throw new Error("transaction failed")
      },
    })

    // WHEN
    await expect(handlers.replaceParty({ pokemonIds: ["not-a-uuid"] }, context)).rejects.toThrow()
    await expect(handlers.catchEncounter({}, context)).rejects.toThrow()
    await expect(handlers.runEncounter({ encounterId: "not-a-uuid" }, context)).rejects.toThrow()
    await expect(handlers.travelTo({ locationId: "pallet-town" }, context)).rejects.toThrow(
      "transaction failed",
    )

    // THEN
    expect(publicationAttempts).toEqual([])
    expect(published).toEqual([])
  })

  test("does not publish if state localization fails", async () => {
    // GIVEN
    const { handlers, context, published, publicationAttempts } = makeHandlers(
      { travelTo: () => ({ kind: "teleported", state }) },
      {
        localizeState: () => {
          throw new Error("localization failed")
        },
      },
    )

    // WHEN
    const request = handlers.travelTo({ locationId: "pallet-town" }, context)

    // THEN
    await expect(request).rejects.toThrow("localization failed")
    expect(publicationAttempts).toEqual([])
    expect(published).toEqual([])
  })

  test("propagates publication failures without recording a completed event", async () => {
    // GIVEN
    const { handlers, context, published, publicationAttempts } = makeHandlers(
      { travelTo: () => ({ kind: "teleported", state }) },
      {
        publish: async () => {
          throw new Error("event publication failed")
        },
      },
    )

    // WHEN
    const request = handlers.travelTo({ locationId: "pallet-town" }, context)

    // THEN
    await expect(request).rejects.toThrow("event publication failed")
    expect(publicationAttempts).toMatchObject([{ locale: "es" }])
    expect(published).toEqual([])
  })
})
