import { describe, expect, test } from "bun:test"
import { globalSpriteCacheDirectory } from "../../../../../src/adapters/sprites/cache.js"

describe("PokéCode sprite cache path", () => {
  test("uses the XDG cache directory when set", () => {
    expect(globalSpriteCacheDirectory({ XDG_CACHE_HOME: "/cache", HOME: "/home/trainer" })).toBe(
      "/cache/pokecode/sprites",
    )
  })

  test("defaults to the home cache directory", () => {
    expect(globalSpriteCacheDirectory({ HOME: "/home/trainer" })).toBe(
      "/home/trainer/.cache/pokecode/sprites",
    )
  })
})
