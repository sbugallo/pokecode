import { Database } from "bun:sqlite"
import { describe, expect, test } from "bun:test"
import { reconcileCompletedUsage } from "../../../src/adapters/opencode/server/usage-reconciliation.js"
import type { UsageApplication } from "../../../src/application/contracts/game.js"
import { createGameFixture } from "../../support/game.js"

const sessionId = "reconciliation-session"
const messageId = "reconciliation-message"
const completedAt = "2026-10-15T00:00:00.000Z"

function reconciliation(
  fixture: ReturnType<typeof createGameFixture>,
  onApplied: (application: UsageApplication) => Promise<void>,
) {
  return reconcileCompletedUsage({
    event: {
      async *subscribe() {
        yield { type: "session.status", data: { sessionID: sessionId, status: { type: "idle" } } }
      },
    },
    session: {
      async context() {
        return [
          {
            id: messageId,
            type: "assistant",
            time: { completed: Date.parse(completedAt) },
            tokens: { input: 10, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          },
        ]
      },
    },
    recordUsage: (input) => fixture.game.recordUsage(input),
    onUsageApplied: async (application) => onApplied(application),
    signal: new AbortController().signal,
  })
}

describe("server usage reconciliation", () => {
  test("publishes only after a separate connection can read committed receipt and gameplay state", async () => {
    // GIVEN
    const fixture = createGameFixture()
    try {
      let callbackCount = 0
      let observed:
        | {
            readonly receipts: number
            readonly committedExperience: number | undefined
            readonly projectedExperience: number | undefined
          }
        | undefined

      // WHEN
      await reconciliation(fixture, async (application) => {
        callbackCount += 1
        const independentConnection = new Database(fixture.databasePath)
        try {
          observed = {
            receipts:
              independentConnection
                .query<{ readonly count: number }, [string, string]>(
                  "SELECT COUNT(*) AS count FROM token_receipts WHERE session_id = ?1 AND message_id = ?2",
                )
                .get(sessionId, messageId)?.count ?? 0,
            committedExperience: independentConnection
              .query<{ readonly experience: number }, []>(
                `SELECT owned_pokemon.experience
                   FROM party_slots
                   JOIN owned_pokemon ON owned_pokemon.id = party_slots.pokemon_id
                   WHERE party_slots.position = 1`,
              )
              .get()?.experience,
            projectedExperience: application.state.party[0]?.pokemon?.experience,
          }
        } finally {
          independentConnection.close()
        }
      })

      // THEN
      expect(callbackCount).toBe(1)
      expect(observed).toEqual({
        receipts: 1,
        committedExperience: 1,
        projectedExperience: 1,
      })
    } finally {
      fixture.dispose()
    }
  })

  test("does not publish or retain a receipt when its gameplay transaction fails", async () => {
    // GIVEN
    const fixture = createGameFixture()
    try {
      const database = new Database(fixture.databasePath)
      try {
        database.run(`CREATE TRIGGER fail_reconciled_usage BEFORE UPDATE ON owned_pokemon
          BEGIN SELECT RAISE(ABORT, 'reconciliation transaction failed'); END`)
      } finally {
        database.close()
      }
      let callbackCount = 0

      // WHEN
      await expect(
        reconciliation(fixture, async () => {
          callbackCount += 1
        }),
      ).rejects.toThrow("reconciliation transaction failed")

      // THEN
      expect(callbackCount).toBe(0)
      const verification = new Database(fixture.databasePath)
      try {
        expect(
          verification
            .query<{ readonly count: number }, [string, string]>(
              "SELECT COUNT(*) AS count FROM token_receipts WHERE session_id = ?1 AND message_id = ?2",
            )
            .get(sessionId, messageId)?.count,
        ).toBe(0)
        expect(
          verification
            .query<{ readonly experience: number }, []>(
              "SELECT experience FROM owned_pokemon LIMIT 1",
            )
            .get()?.experience,
        ).toBe(0)
      } finally {
        verification.close()
      }
    } finally {
      fixture.dispose()
    }
  })
})
