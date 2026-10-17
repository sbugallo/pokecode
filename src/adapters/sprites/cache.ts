import { createHash } from "node:crypto"
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { spriteSourcesForSpecies } from "../../domain/content/sprites.js"
import type { SpriteInput, SpriteResolution } from "./contracts.js"

export type { SpriteResolution } from "./contracts.js"

export type SpriteCache = {
  resolve(input: SpriteInput): Promise<SpriteResolution>
}

type SpriteCacheDependencies = {
  readonly cacheDirectory: string
  readonly fetch: typeof fetch
}

export function globalSpriteCacheDirectory(environment: NodeJS.ProcessEnv = process.env): string {
  const { XDG_CACHE_HOME: cacheHome, HOME: home } = environment
  return join(cacheHome ?? join(home ?? homedir(), ".cache"), "pokecode", "sprites")
}

export function createSpriteCache(dependencies: SpriteCacheDependencies): SpriteCache {
  const resolve = async (input: SpriteInput): Promise<SpriteResolution> => {
    for (const source of spriteSourcesForSpecies(input.speciesId, input.shiny, input.gender)) {
      const destination = cachePathFor(source, dependencies.cacheDirectory)
      if (existsSync(destination)) return { kind: "cached", source: destination }
      const response = await downloadSprite(source, dependencies.fetch)
      if (response === null) continue
      mkdirSync(dirname(destination), { recursive: true })
      const temporary = `${destination}.${crypto.randomUUID()}.tmp`
      writeFileSync(temporary, new Uint8Array(await response.arrayBuffer()))
      renameSync(temporary, destination)
      return { kind: "cached", source: destination }
    }
    return { kind: "placeholder" }
  }

  return { resolve }
}

function cachePathFor(source: string, cacheDirectory: string): string {
  return join(cacheDirectory, `${createHash("sha256").update(source).digest("hex")}.png`)
}

async function downloadSprite(source: string, request: typeof fetch): Promise<Response | null> {
  try {
    const response = await request(source, { signal: AbortSignal.timeout(5_000) })
    return response.ok ? response : null
  } catch (error) {
    if (error instanceof TypeError || error instanceof DOMException) return null
    throw error
  }
}
