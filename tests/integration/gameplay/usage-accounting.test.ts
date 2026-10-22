import { Database } from "bun:sqlite"
import { describe, expect, test } from "bun:test"
import { openGameRepository } from "../../../src/adapters/sqlite/game-repository.js"
import { createRecordUsage } from "../../../src/application/use-cases/record-usage.js"
import { createGameFixture, usageTestConfig } from "../../support/game.js"

const completedAt = "2026-10-15T00:00:00.000Z"

function usage(
  messageId: string,
  overrides: Partial<{
    readonly sessionId: string
    readonly inputTokens: number
    readonly outputTokens: number
    readonly reasoningTokens: number
    readonly cacheReadTokens: number
    readonly cacheWriteTokens: number
  }> = {},
) {
  return {
    sessionId: overrides.sessionId ?? "usage-session",
    messageId,
    inputTokens: overrides.inputTokens ?? 300,
    outputTokens: overrides.outputTokens ?? 400,
    reasoningTokens: overrides.reasoningTokens ?? 200,
    cacheReadTokens: overrides.cacheReadTokens ?? 500,
    cacheWriteTokens: overrides.cacheWriteTokens ?? 100,
    completedAt,
  }
}

describe("usage accounting gameplay", () => {
  test("applies the total of every token category to experience and exploration", () => {
    // GIVEN
    const fixture = createGameFixture({
      config: { ...usageTestConfig, locationUnlockBaseTokens: 10_000 },
    })
    try {
      // WHEN
      const application = fixture.game.recordUsage(usage("all-token-categories"))

      // THEN
      expect(application.kind).toBe("applied")
      expect(application.state.party[0]?.pokemon?.experience).toBe(1.5)
      expect(application.state.exploration?.locationUnlockProgress).toBe(1_500)
      const database = new Database(fixture.databasePath)
      try {
        expect(
          database
            .query<{ readonly tokenCount: number }, []>(
              "SELECT token_count AS tokenCount FROM token_receipts WHERE session_id = 'usage-session' AND message_id = 'all-token-categories'",
            )
            .get()?.tokenCount,
        ).toBe(1_500)
      } finally {
        database.close()
      }
    } finally {
      fixture.dispose()
    }
  })

  test("deduplicates receipts across connections and reopen but distinguishes sessions", () => {
    // GIVEN
    const fixture = createGameFixture()
    try {
      const first = fixture.game.recordUsage(usage("same-message"))
      fixture.reopen()

      // WHEN
      const peer = openGameRepository(fixture.databasePath)
      let peerResult: string
      try {
        peerResult = createRecordUsage({
          transactions: peer.transactions,
          readState: () => peer.readState(),
          createId: () => "00000000-0000-4000-8000-000000000200",
        })(usage("same-message"), usageTestConfig, () => 0.5).kind
      } finally {
        peer.close()
      }
      const duplicate = fixture.game.recordUsage(
        usage("same-message", { inputTokens: 30_000, sessionId: "usage-session" }),
      )
      const independentSession = fixture.game.recordUsage(
        usage("same-message", { sessionId: "another-session" }),
      )

      // THEN
      expect(first.kind).toBe("applied")
      expect(peerResult).toBe("duplicate")
      expect(duplicate.kind).toBe("duplicate")
      expect(duplicate.state.party[0]?.pokemon?.experience).toBe(1.5)
      expect(independentSession.kind).toBe("applied")
      expect(independentSession.state.party[0]?.pokemon?.experience).toBe(3)
      const database = new Database(fixture.databasePath)
      try {
        expect(
          database
            .query<{ readonly count: number }, [string]>(
              "SELECT COUNT(*) AS count FROM token_receipts WHERE message_id = ?1",
            )
            .get("same-message")?.count,
        ).toBe(2)
      } finally {
        database.close()
      }
    } finally {
      fixture.dispose()
    }
  })

  test("keeps an inactive receipt consumed across reopen and starter selection", () => {
    // GIVEN
    const fixture = createGameFixture({ withStarter: false })
    try {
      const inactive = fixture.game.recordUsage(usage("before-onboarding"))
      fixture.reopen()

      // WHEN
      const starter = fixture.game.chooseStarter("kanto", "bulbasaur")
      const replay = fixture.game.recordUsage(usage("before-onboarding"))
      const fresh = fixture.game.recordUsage(usage("after-onboarding"))

      // THEN
      expect(inactive.kind).toBe("inactive")
      expect(starter.kind).toBe("selected")
      expect(replay.kind).toBe("duplicate")
      expect(replay.state.party[0]?.pokemon?.experience).toBe(0)
      expect(fresh.kind).toBe("applied")
      expect(fresh.state.party[0]?.pokemon?.experience).toBe(1.5)
    } finally {
      fixture.dispose()
    }
  })

  test("keeps a frozen receipt consumed through reopen and choice resolution", () => {
    // GIVEN
    const fixture = createGameFixture()
    try {
      const pokemonId = fixture.game.status().party[0]?.pokemon?.id
      const choiceId = "00000000-0000-4000-8000-000000000100"
      const database = new Database(fixture.databasePath)
      try {
        database
          .query<void, [string, string, string]>(
            `INSERT INTO pending_choices (id, trainer_id, kind, payload, created_at)
             SELECT ?1, id, 'move', ?2, ?3 FROM trainers`,
          )
          .run(
            choiceId,
            JSON.stringify({ pokemonId, move: { id: "razor-leaf", name: "Razor Leaf" } }),
            completedAt,
          )
      } finally {
        database.close()
      }
      const frozen = fixture.game.recordUsage(usage("during-choice"))
      fixture.reopen()

      // WHEN
      const resolved = fixture.game.resolveMoveChoice(choiceId, "razor-leaf")
      const replay = fixture.game.recordUsage(usage("during-choice"))
      const fresh = fixture.game.recordUsage(usage("after-choice"))

      // THEN
      expect(frozen.kind).toBe("frozen-discarded")
      expect(resolved.kind).toBe("resolved")
      expect(replay.kind).toBe("duplicate")
      expect(replay.state.party[0]?.pokemon?.experience).toBe(0)
      expect(fresh.kind).toBe("applied")
      expect(fresh.state.party[0]?.pokemon?.experience).toBe(1.5)
    } finally {
      fixture.dispose()
    }
  })

  test("awards experience to an eligible party Pokémon but not a capped party Pokémon or PC Pokémon", () => {
    // GIVEN
    const fixture = createGameFixture()
    try {
      const database = new Database(fixture.databasePath)
      try {
        database.run(`
          UPDATE owned_pokemon SET level = 100
          WHERE id = (SELECT pokemon_id FROM party_slots WHERE position = 1);
          INSERT INTO owned_pokemon (
            id, trainer_id, species_id, name, level, ability, nature, gender,
            hp_iv, attack_iv, defense_iv, special_attack_iv, special_defense_iv, speed_iv
          )
          SELECT '00000000-0000-4000-8000-000000000101', trainer_id, 'eevee', 'Eevee', 5,
            ability, nature, gender, hp_iv, attack_iv, defense_iv, special_attack_iv,
            special_defense_iv, speed_iv
          FROM owned_pokemon WHERE id = (SELECT pokemon_id FROM party_slots WHERE position = 1);
          UPDATE party_slots SET pokemon_id = '00000000-0000-4000-8000-000000000101'
          WHERE position = 2;
          INSERT INTO owned_pokemon (
            id, trainer_id, species_id, name, level, ability, nature, gender,
            hp_iv, attack_iv, defense_iv, special_attack_iv, special_defense_iv, speed_iv
          )
          SELECT '00000000-0000-4000-8000-000000000102', trainer_id, 'ivysaur', 'Ivysaur', 5,
            ability, nature, gender, hp_iv, attack_iv, defense_iv, special_attack_iv,
            special_defense_iv, speed_iv
          FROM owned_pokemon WHERE id = (SELECT pokemon_id FROM party_slots WHERE position = 1);
        `)
      } finally {
        database.close()
      }

      // WHEN
      const application = fixture.game.recordUsage(usage("party-eligibility"))

      // THEN
      expect(application.kind).toBe("applied")
      expect(application.state.party[0]?.pokemon).toMatchObject({ level: 100, experience: 0 })
      expect(application.state.party[1]?.pokemon).toMatchObject({
        speciesId: "eevee",
        experience: 1.5,
      })
      const pcPokemon = fixture.game
        .collection()
        .pokemon.find((pokemon) => pokemon.speciesId === "ivysaur")
      expect(pcPokemon).toMatchObject({ level: 5, experience: 0 })
    } finally {
      fixture.dispose()
    }
  })

  test("continues exploration and encounter processing after progression queues a choice", () => {
    // GIVEN
    const fixture = createGameFixture({
      config: {
        pauseOnPendingChoice: true,
        encounterMinimumTokens: 1,
        encounterMaximumTokens: 1,
        locationUnlockBaseTokens: 1,
        locationUnlockExponent: 1,
        locationUnlockRegionExponent: 0,
      },
      random: () => 0,
    })
    try {
      const database = new Database(fixture.databasePath)
      try {
        database.run(`
          UPDATE trainers SET current_location_id = 'kanto-route-1';
          UPDATE location_progress SET location_id = 'kanto-route-1';
          UPDATE owned_pokemon SET species_id = 'eevee', name = 'Eevee', level = 24, experience = 0;
        `)
      } finally {
        database.close()
      }

      // WHEN
      const result = fixture.game.recordUsage({
        ...usage("choice-and-continuation", {
          inputTokens: 2_000_000,
          outputTokens: 0,
          reasoningTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        }),
      })

      // THEN
      expect(result.kind).toBe("applied")
      expect(
        result.state.pendingChoices.some(
          (choice) => choice.kind === "evolution" || choice.kind === "move",
        ),
      ).toBe(true)
      expect(result.state.pendingChoices.some((choice) => choice.kind === "catch")).toBe(true)
      expect(
        result.state.exploration?.locations.some(
          (location) => location.id === "viridian-city" && location.unlocked,
        ),
      ).toBe(true)
      expect(result.state.pendingEncounter).not.toBeNull()
    } finally {
      fixture.dispose()
    }
  })
})
