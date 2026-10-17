import { describe, expect, test } from "bun:test"
import {
  dexDisplayName,
  dexFooter,
  dexModalWidth,
  dexScrollDelta,
  isDexCloseKey,
} from "../../../../../../../src/adapters/opencode/tui/dex/dialog.js"

describe("Pokédex navigation policy", () => {
  test("redacts unknown names and maps supported keys to navigation behavior", () => {
    // GIVEN

    // WHEN
    const names = [
      dexDisplayName("Bulbasaur", "caught"),
      dexDisplayName("Bulbasaur", "seen"),
      dexDisplayName("Bulbasaur", "unknown"),
    ]
    const deltas = ["up", "down", "left", "right", "enter"].map(dexScrollDelta)

    // THEN
    expect(names).toEqual(["Bulbasaur", "Bulbasaur", "----"])
    expect(deltas).toEqual([-1, 1, -10, 10, undefined])
    expect(dexFooter).toBe("↑↓: 1 item · ←→: 10 items · Esc: Close")
    expect([isDexCloseKey("escape"), isDexCloseKey("esc"), isDexCloseKey("enter")]).toEqual([
      true,
      true,
      false,
    ])
    expect([dexModalWidth(120), dexModalWidth(52)]).toEqual([56, 48])
  })
})
