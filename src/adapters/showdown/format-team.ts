import { localizedSpeciesName } from "../../domain/content/catalog.js"
import { regionalFormsCatalog } from "../../domain/content/catalogs/regional-forms-catalog.js"
import type { PokemonInstance } from "../../domain/pokemon/model.js"

const showdownNameBySpeciesId: ReadonlyMap<string, string> = new Map(
  regionalFormsCatalog.map((form) => [form.id, form.showdownName]),
)

export function formatShowdownTeam(party: readonly PokemonInstance[]): string {
  return party.map(formatPokemon).join("\n\n")
}

function formatPokemon(pokemon: PokemonInstance): string {
  const ivs = pokemon.ivs
  const speciesName = localizedSpeciesName(pokemon.speciesId)
  const showdownName = showdownNameBySpeciesId.get(pokemon.speciesId) ?? speciesName
  const name = pokemon.name === speciesName ? showdownName : `${pokemon.name} (${showdownName})`
  return [
    `${name}${pokemon.shiny ? " (Shiny)" : ""}`,
    `Ability: ${pokemon.ability}`,
    `Level: ${pokemon.level}`,
    `Shiny: ${pokemon.shiny ? "Yes" : "No"}`,
    "EVs: 0 HP / 0 Atk / 0 Def / 0 SpA / 0 SpD / 0 Spe",
    `IVs: ${ivs.hp} HP / ${ivs.attack} Atk / ${ivs.defense} Def / ${ivs.specialAttack} SpA / ${ivs.specialDefense} SpD / ${ivs.speed} Spe`,
    `${pokemon.nature} Nature`,
    ...pokemon.moves.map((move) => `- ${move.name}`),
  ].join("\n")
}
