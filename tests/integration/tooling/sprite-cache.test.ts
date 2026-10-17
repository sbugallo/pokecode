import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { createSpriteCache } from "../../../src/adapters/sprites/cache.js"

const directories: string[] = []

function fakeFetch(respond: (input: string | URL | Request) => Promise<Response>): typeof fetch {
  return Object.assign(respond, { preconnect: (_url: string | URL) => {} })
}

async function temporaryCacheDirectory(): Promise<string> {
  const directory = await mkdtemp(join("/tmp/opencode", "pokemon-sprite-cache-"))
  directories.push(directory)
  return directory
}

afterEach(async () => {
  const toRemove = directories.splice(0)
  await Promise.all(toRemove.map((directory) => rm(directory, { recursive: true, force: true })))
})

describe("sprite cache integration", () => {
  test("falls back from a missing shiny sprite to its matching normal sprite", async () => {
    // GIVEN
    const requested: string[] = []
    const cache = createSpriteCache({
      cacheDirectory: await temporaryCacheDirectory(),
      fetch: fakeFetch(async (input) => {
        const source = input.toString()
        requested.push(source)
        return source.includes("/shiny/")
          ? new Response(null, { status: 404 })
          : new Response("png")
      }),
    })

    // WHEN
    const sprite = await cache.resolve({ speciesId: "bulbasaur", shiny: true, gender: "male" })

    // THEN
    expect(sprite.kind).toBe("cached")
    expect(requested).toEqual([
      "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/shiny/1.png",
      "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/1.png",
    ])
  })

  test("serves cached bytes when a later resolution is offline", async () => {
    // GIVEN
    const directory = await temporaryCacheDirectory()
    let downloads = 0
    const online = createSpriteCache({
      cacheDirectory: directory,
      fetch: fakeFetch(async () => {
        downloads += 1
        return new Response("sprite-bytes")
      }),
    })
    const offline = createSpriteCache({
      cacheDirectory: directory,
      fetch: fakeFetch(async () => {
        throw new TypeError("network unavailable")
      }),
    })

    // WHEN
    const downloaded = await online.resolve({
      speciesId: "bulbasaur",
      shiny: false,
      gender: "male",
    })
    const reused = await offline.resolve({ speciesId: "bulbasaur", shiny: false, gender: "male" })

    // THEN
    expect(downloaded.kind).toBe("cached")
    expect(reused).toEqual(downloaded)
    expect(downloads).toBe(1)
    if (downloaded.kind === "cached") {
      expect(await readFile(downloaded.source, "utf8")).toBe("sprite-bytes")
    }
  })

  test("keeps male shiny, female shiny, and normal female sprites in distinct cache entries", async () => {
    // GIVEN
    const requested: string[] = []
    const cache = createSpriteCache({
      cacheDirectory: await temporaryCacheDirectory(),
      fetch: fakeFetch(async (input) => {
        const source = input.toString()
        requested.push(source)
        const bytes = source.includes("/shiny/female/")
          ? "female-shiny-bytes"
          : source.includes("/shiny/")
            ? "male-shiny-bytes"
            : "female-normal-bytes"
        return new Response(bytes)
      }),
    })
    const variants = [
      { shiny: true, gender: "male" as const },
      { shiny: true, gender: "female" as const },
      { shiny: false, gender: "female" as const },
    ]

    // WHEN
    const results = await Promise.all(
      variants.map(({ shiny, gender }) => cache.resolve({ speciesId: "pyroar", shiny, gender })),
    )
    const cacheFiles = results.map((result) => {
      if (result.kind !== "cached") throw new Error("Expected each sprite variant to be cached")
      return result.source
    })
    const bytes = await Promise.all(cacheFiles.map((source) => readFile(source, "utf8")))
    const repeated = await Promise.all(
      variants.map(({ shiny, gender }) => cache.resolve({ speciesId: "pyroar", shiny, gender })),
    )

    // THEN
    expect(new Set(requested).size).toBe(3)
    expect(new Set(cacheFiles).size).toBe(3)
    expect(bytes).toEqual(["male-shiny-bytes", "female-shiny-bytes", "female-normal-bytes"])
    expect(repeated).toEqual(results)
    expect(requested).toHaveLength(3)
  })

  test("returns a placeholder when every sprite source is unavailable", async () => {
    // GIVEN
    const cache = createSpriteCache({
      cacheDirectory: await temporaryCacheDirectory(),
      fetch: fakeFetch(async () => new Response(null, { status: 404 })),
    })

    // WHEN
    const sprite = await cache.resolve({ speciesId: "bulbasaur", shiny: false, gender: "male" })

    // THEN
    expect(sprite).toEqual({ kind: "placeholder" })
  })
})
