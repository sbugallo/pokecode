import { expect, test } from "bun:test"
import { PokecodeRpc } from "../../../src/adapters/opencode/rpc/contract.js"
import { createPokecodeHandlers } from "../../../src/adapters/opencode/server/handlers.js"
import {
  localizeCollection,
  localizeDex,
  localizeGameState,
} from "../../../src/adapters/presentation/localization.js"
import { createGameFixture } from "../../support/game.js"
import { makeTuiClient } from "../../support/tui.js"

test("PC management round-trips through RPC validation and publishes localized state", async () => {
  const fixture = createGameFixture()
  try {
    const published: string[] = []
    const handlers = createPokecodeHandlers({
      game: fixture.game,
      localizers: {
        state: (state) => localizeGameState(state, "es"),
        collection: (collection) => localizeCollection(collection, "es"),
        dex: (dex) => localizeDex(dex, "es"),
      },
      sprites: { resolve: async () => ({ kind: "placeholder" }) },
      publishStatusChanged: async (state) => {
        published.push(state.party[0]?.pokemon?.name ?? "")
      },
    })
    const context = {} as Parameters<typeof handlers.renamePokemon>[1]
    const client = makeTuiClient({
      renamePokemon: async (input) => {
        const response = await handlers.renamePokemon(input, context)
        return PokecodeRpc.methods.renamePokemon.output.parse(JSON.parse(JSON.stringify(response)))
      },
      releasePokemon: async (input) => {
        const response = await handlers.releasePokemon(input, context)
        return PokecodeRpc.methods.releasePokemon.output.parse(JSON.parse(JSON.stringify(response)))
      },
    })
    const pokemonId = fixture.game.collection().pokemon[0]?.id
    if (pokemonId === undefined) throw new Error("Missing starter")
    const renamed = await client.renamePokemon({ pokemonId, name: "Leaf" })
    expect(renamed.kind).toBe("renamed")
    expect(renamed.state.locale).toBe("es")
    expect(renamed.state.party[0]?.pokemon?.name).toBe("Leaf")
    expect((await client.releasePokemon({ pokemonId })).kind).toBe("last-party-pokemon")
    expect(published).toEqual(["Leaf", "Leaf"])
    await expect(
      handlers.renamePokemon({ pokemonId: "not-a-uuid", name: "Leaf" }, context),
    ).rejects.toThrow()
    await expect(handlers.releasePokemon({ pokemonId: "not-a-uuid" }, context)).rejects.toThrow()
    expect(published).toHaveLength(2)
  } finally {
    fixture.dispose()
  }
})
