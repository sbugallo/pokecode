import { describe, expect, test } from "bun:test"
import type { PokemonTuiRpcTransport } from "../../../../../../src/adapters/opencode/tui/client.js"
import { createPokemonTuiClient } from "../../../../../../src/adapters/opencode/tui/client.js"
import { makeTuiRpcTransport, makeTuiState } from "../../../../../support/tui.js"

type RpcMethod = Exclude<keyof PokemonTuiRpcTransport, "events">
type Client = ReturnType<typeof createPokemonTuiClient>

const malformedRoutes: { name: string; request: (client: Client) => Promise<unknown> }[] = [
  { name: "status", request: (client) => client.status({}) },
  {
    name: "starter selection",
    request: (client) => client.chooseStarter({ regionId: "kanto", speciesId: "bulbasaur" }),
  },
  { name: "location travel", request: (client) => client.travelTo({ locationId: "pallet-town" }) },
  { name: "region travel", request: (client) => client.travelToRegion({ regionId: "johto" }) },
  {
    name: "encounter capture",
    request: (client) =>
      client.catchEncounter({ encounterId: "a058c8b8-6638-42d3-84a6-ea3f5f8d5003" }),
  },
  {
    name: "encounter escape",
    request: (client) =>
      client.runEncounter({ encounterId: "a058c8b8-6638-42d3-84a6-ea3f5f8d5003" }),
  },
  { name: "collection", request: (client) => client.collection({}) },
  { name: "Pokédex", request: (client) => client.dex({}) },
  { name: "team export", request: (client) => client.exportTeam({}) },
  {
    name: "sprite resolution",
    request: (client) => client.sprite({ speciesId: "bulbasaur", shiny: false, gender: "female" }),
  },
  {
    name: "party replacement",
    request: (client) =>
      client.replaceParty({ pokemonIds: ["00000000-0000-4000-8000-000000000001"] }),
  },
  {
    name: "move choice",
    request: (client) =>
      client.resolveMoveChoice({
        choiceId: "00000000-0000-4000-8000-000000000002",
        selectedMoveId: "tackle",
      }),
  },
  {
    name: "evolution choice",
    request: (client) =>
      client.resolveEvolutionChoice({
        choiceId: "00000000-0000-4000-8000-000000000002",
        selectedSpeciesId: "ivysaur",
      }),
  },
  { name: "dismissed region choice", request: (client) => client.dismissNextRegionChoice({}) },
  { name: "reopened region choice", request: (client) => client.reopenNextRegionChoice({}) },
]

describe("typed TUI RPC client", () => {
  test("rejects a Dex response missing exact discoveries instead of marking everything unknown", async () => {
    const client = createPokemonTuiClient(
      makeTuiRpcTransport({ dex: async () => ({ pokemon: [] }) }),
    )
    await expect(client.dex({})).rejects.toThrow()
  })

  test("parses each supported RPC response family", async () => {
    // GIVEN
    const state = makeTuiState()
    const calls: Array<{ readonly method: RpcMethod; readonly input: unknown }> = []
    const record = (method: RpcMethod, response: unknown) => async (input: unknown) => {
      calls.push({ method, input })
      return response
    }
    const client = createPokemonTuiClient(
      makeTuiRpcTransport({
        status: record("status", state),
        chooseStarter: record("chooseStarter", { kind: "selected", state }),
        travelTo: record("travelTo", { kind: "teleported", state }),
        travelToRegion: record("travelToRegion", { kind: "traveled", state }),
        catchEncounter: record("catchEncounter", { kind: "no-encounter", state }),
        runEncounter: record("runEncounter", { kind: "no-encounter", state }),
        collection: record("collection", { pokemon: [] }),
        dex: record("dex", { pokemon: [], discoveries: [] }),
        exportTeam: record("exportTeam", { kind: "inactive", text: "" }),
        sprite: record("sprite", { kind: "placeholder" }),
        replaceParty: record("replaceParty", { kind: "replaced", state }),
        resolveMoveChoice: record("resolveMoveChoice", { kind: "resolved", state }),
        resolveEvolutionChoice: record("resolveEvolutionChoice", { kind: "resolved", state }),
        dismissNextRegionChoice: record("dismissNextRegionChoice", state),
        reopenNextRegionChoice: record("reopenNextRegionChoice", state),
      }),
    )

    // WHEN
    const responses = await Promise.all([
      client.status({}),
      client.chooseStarter({ regionId: "kanto", speciesId: "bulbasaur" }),
      client.travelTo({ locationId: "pallet-town" }),
      client.travelToRegion({ regionId: "johto" }),
      client.catchEncounter({ encounterId: "a058c8b8-6638-42d3-84a6-ea3f5f8d5003" }),
      client.runEncounter({ encounterId: "a058c8b8-6638-42d3-84a6-ea3f5f8d5003" }),
      client.collection({}),
      client.dex({}),
      client.exportTeam({}),
      client.sprite({ speciesId: "bulbasaur", shiny: false, gender: "female" }),
      client.replaceParty({ pokemonIds: ["00000000-0000-4000-8000-000000000001"] }),
      client.resolveMoveChoice({
        choiceId: "00000000-0000-4000-8000-000000000002",
        selectedMoveId: "tackle",
      }),
      client.resolveEvolutionChoice({
        choiceId: "00000000-0000-4000-8000-000000000002",
        selectedSpeciesId: "ivysaur",
      }),
      client.dismissNextRegionChoice({}),
      client.reopenNextRegionChoice({}),
    ])

    // THEN
    expect(responses[0]).toEqual(state)
    expect([
      responses[1]?.kind,
      responses[2]?.kind,
      responses[3]?.kind,
      responses[4]?.kind,
      responses[5]?.kind,
    ]).toEqual(["selected", "teleported", "traveled", "no-encounter", "no-encounter"])
    expect(responses.slice(6, 8)).toEqual([{ pokemon: [] }, { pokemon: [], discoveries: [] }])
    expect(responses[8]).toEqual({ kind: "inactive", text: "" })
    expect(responses[9]).toEqual({ kind: "placeholder" })
    expect([responses[10]?.kind, responses[11]?.kind, responses[12]?.kind]).toEqual([
      "replaced",
      "resolved",
      "resolved",
    ])
    expect(responses.slice(13)).toEqual([state, state])
    expect(calls).toEqual([
      { method: "status", input: {} },
      { method: "chooseStarter", input: { regionId: "kanto", speciesId: "bulbasaur" } },
      { method: "travelTo", input: { locationId: "pallet-town" } },
      { method: "travelToRegion", input: { regionId: "johto" } },
      { method: "catchEncounter", input: { encounterId: "a058c8b8-6638-42d3-84a6-ea3f5f8d5003" } },
      { method: "runEncounter", input: { encounterId: "a058c8b8-6638-42d3-84a6-ea3f5f8d5003" } },
      { method: "collection", input: {} },
      { method: "dex", input: {} },
      { method: "exportTeam", input: {} },
      { method: "sprite", input: { speciesId: "bulbasaur", shiny: false, gender: "female" } },
      { method: "replaceParty", input: { pokemonIds: ["00000000-0000-4000-8000-000000000001"] } },
      {
        method: "resolveMoveChoice",
        input: { choiceId: "00000000-0000-4000-8000-000000000002", selectedMoveId: "tackle" },
      },
      {
        method: "resolveEvolutionChoice",
        input: { choiceId: "00000000-0000-4000-8000-000000000002", selectedSpeciesId: "ivysaur" },
      },
      { method: "dismissNextRegionChoice", input: {} },
      { method: "reopenNextRegionChoice", input: {} },
    ])
  })

  test("rejects malformed status events and always unsubscribes", () => {
    // GIVEN
    let eventHandler: ((event: { readonly data: unknown }) => void) | undefined
    const client = createPokemonTuiClient(
      makeTuiRpcTransport({
        events: {
          on: (_event, listener) => {
            eventHandler = listener
            return () => {
              eventHandler = undefined
            }
          },
        },
      }),
    )
    const unsubscribe = client.onStatusChanged(() => {})

    // WHEN
    const invalidEvent = () => eventHandler?.({ data: { phase: "invalid" } })

    // THEN
    try {
      expect(invalidEvent).toThrow()
    } finally {
      unsubscribe()
    }
    expect(eventHandler).toBeUndefined()
  })

  test.each(malformedRoutes)("rejects a malformed $name response", async ({ request }) => {
    // GIVEN
    const malformed = async () => ({})
    const client = createPokemonTuiClient(
      makeTuiRpcTransport({
        status: malformed,
        chooseStarter: malformed,
        travelTo: malformed,
        travelToRegion: malformed,
        catchEncounter: malformed,
        runEncounter: malformed,
        collection: malformed,
        dex: malformed,
        exportTeam: malformed,
        sprite: malformed,
        replaceParty: malformed,
        resolveMoveChoice: malformed,
        resolveEvolutionChoice: malformed,
        dismissNextRegionChoice: malformed,
        reopenNextRegionChoice: malformed,
      }),
    )

    // WHEN
    const response = request(client)

    // THEN
    await expect(response).rejects.toThrow()
  })
})
