import { expect, test } from "bun:test"
import { PokecodeRpc } from "../../../src/adapters/opencode/rpc/contract.js"
import { createPokecodeHandlers } from "../../../src/adapters/opencode/server/handlers.js"
import { locationTravelProjection } from "../../../src/adapters/opencode/tui/travel/projection.js"
import {
  localizeCollection,
  localizeDex,
  localizeGameState,
} from "../../../src/adapters/presentation/localization.js"
import { createGameFixture, withGameDatabase } from "../../support/game.js"
import { makeTuiClient } from "../../support/tui.js"

test("captured and exact-form discoveries survive the declared RPC output boundary into location previews", async () => {
  const fixture = createGameFixture({
    config: {
      pauseOnPendingChoice: true,
      xpTokensPerPoint: 1_000,
      locationUnlockBaseTokens: 100_000,
      locationUnlockExponent: 1,
      locationUnlockRegionExponent: 0,
      encounterMinimumTokens: 1,
      encounterMaximumTokens: 1,
      locationUnlockTokens: 2_160_000,
    },
    random: () => 0,
  })
  try {
    withGameDatabase(fixture.databasePath, (db) =>
      db.run(
        "INSERT INTO location_progress (trainer_id,location_id) SELECT id,'kanto-route-1' FROM trainers",
      ),
    )
    fixture.game.travelTo("kanto-route-1")
    const encountered = fixture.game.recordUsage({
      sessionId: "dex-rpc",
      messageId: "caught-preview",
      inputTokens: 1,
      outputTokens: 0,
      reasoningTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      completedAt: "2026-10-15T00:00:00.000Z",
    })
    const encounterId = encountered.state.pendingEncounter?.id
    const capturedSpeciesId = encountered.state.pendingEncounter?.speciesId
    if (encounterId === undefined || capturedSpeciesId === undefined) {
      throw new Error("Expected a generated encounter")
    }
    expect(fixture.game.catchEncounter(encounterId).kind).toBe("caught")
    withGameDatabase(fixture.databasePath, (db) => {
      db.run("UPDATE region_progress SET completed=1 WHERE region_id='kanto'")
      db.run(
        "INSERT INTO pokedex_entries (trainer_id,species_id,seen,caught) SELECT id,'raichu',1,1 FROM trainers",
      )
      db.run(
        "INSERT INTO pokedex_entries (trainer_id,species_id,seen,caught) SELECT id,'raichu-alola',1,0 FROM trainers",
      )
    })
    expect(fixture.game.travelToRegion("galar").kind).toBe("traveled")
    withGameDatabase(fixture.databasePath, (db) =>
      db.run(
        "INSERT INTO location_progress (trainer_id,location_id) SELECT id,'fields-of-honor' FROM trainers",
      ),
    )
    const handlers = createPokecodeHandlers({
      game: fixture.game,
      localizers: {
        state: (state) => localizeGameState(state, "es"),
        collection: (collection) => localizeCollection(collection, "es"),
        dex: (dex) => localizeDex(dex, "es"),
      },
      sprites: { resolve: async () => ({ kind: "placeholder" }) },
      publishStatusChanged: async () => {},
    })
    const context = {} as Parameters<typeof handlers.dex>[1]
    const response = await handlers.dex({}, context)
    // OpenCode validates handler output with the schema declared by the RPC contract.
    const validated = await PokecodeRpc.methods.dex.output["~standard"].validate(
      JSON.parse(JSON.stringify(response)),
    )
    if (validated.issues !== undefined) throw new Error(JSON.stringify(validated.issues))
    const client = makeTuiClient({ dex: async () => validated.value })
    const dex = await client.dex({})
    const preview = locationTravelProjection(localizeGameState(fixture.game.status(), "es"), dex)
    expect(
      preview?.pokemonByLocation["kanto-route-1"]?.find(
        (pokemon) => pokemon.speciesId === capturedSpeciesId,
      )?.status,
    ).toBe("caught")
    expect(
      preview?.pokemonByLocation["fields-of-honor"]?.find(
        (pokemon) => pokemon.speciesId === "raichu-alola",
      )?.status,
    ).toBe("seen")
  } finally {
    fixture.dispose()
  }
})
