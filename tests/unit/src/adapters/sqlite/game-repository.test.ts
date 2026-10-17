import { describe, expect, test } from "bun:test"
import { globalDatabasePath } from "../../../../../src/adapters/sqlite/game-repository.js"

describe("PokéCode database path", () => {
  test("uses the XDG data directory when set", () => {
    expect(globalDatabasePath({ XDG_DATA_HOME: "/data", HOME: "/home/trainer" })).toBe(
      "/data/pokecode/game.sqlite",
    )
  })

  test("defaults to the home data directory", () => {
    expect(globalDatabasePath({ HOME: "/home/trainer" })).toBe(
      "/home/trainer/.local/share/pokecode/game.sqlite",
    )
  })
})
