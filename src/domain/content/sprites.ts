import type { PokemonGender } from "../pokemon/types.js"
import { generatedContentCatalog } from "./catalog.js"

export const missingPokemonSpriteUrl =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/0.png"

const spritesBySpecies = new Map(
  [...generatedContentCatalog.species, ...generatedContentCatalog.regionalForms].map((species) => [
    species.id,
    species.sprites,
  ]),
)

export function spriteUrlForSpecies(
  speciesId: string,
  shiny = false,
  gender: PokemonGender = "genderless",
): string | null {
  const sprites = spritesBySpecies.get(speciesId)
  if (sprites === undefined) return null
  const variant = gender === "female" ? (sprites.female ?? sprites.default) : sprites.default
  return shiny ? variant.shiny : variant.normal
}

export function spriteSourcesForSpecies(
  speciesId: string,
  shiny: boolean,
  gender: PokemonGender,
): readonly string[] {
  const normal = spriteUrlForSpecies(speciesId, false, gender)
  if (normal === null) return [missingPokemonSpriteUrl]
  if (!shiny) return [normal, missingPokemonSpriteUrl]
  return [spriteUrlForSpecies(speciesId, true, gender) ?? normal, normal, missingPokemonSpriteUrl]
}
