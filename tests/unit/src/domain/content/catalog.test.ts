import { describe, expect, test } from "bun:test"
import {
  localizedAbilityName,
  localizedLocationName,
  localizedMoveName,
  localizedPokemonName,
} from "../../../../../src/domain/content/catalog.js"

describe("catalog name lookup", () => {
  test("preserves caller-provided fallbacks for unknown entries", () => {
    // GIVEN
    // WHEN
    const names = [
      localizedPokemonName("not-a-species", "es", "provided species"),
      localizedMoveName("not-a-move", "es", "provided move"),
      localizedAbilityName("not an ability", "es", "provided ability"),
      localizedLocationName("not-a-location", "es", "provided location"),
    ]

    // THEN
    expect(names).toEqual([
      "provided species",
      "provided move",
      "provided ability",
      "provided location",
    ])
  })
})
