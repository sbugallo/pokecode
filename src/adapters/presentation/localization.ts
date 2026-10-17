import type { GameState, PokemonCollection, PokemonDex } from "../../application/contracts/game.js"
import {
  localizedAbilityName,
  localizedLocationName,
  localizedMoveName,
  localizedPokemonName,
  regions,
} from "../../domain/content/catalog.js"
import { localizedName } from "../../domain/content/names.js"
import type { PokemonInstance } from "../../domain/pokemon/model.js"
import { type Language, languageSchema } from "../../domain/shared/language.js"

export type { Language }
export {
  languageSchema,
  localizedLocationName,
  localizedMoveName,
  localizedName,
  localizedPokemonName,
}

export function localizePokemon(pokemon: PokemonInstance, language: Language): PokemonInstance {
  return {
    ...pokemon,
    name:
      pokemon.name === pokemon.speciesId ||
      pokemon.name === localizedPokemonName(pokemon.speciesId, "en", pokemon.speciesId)
        ? localizedPokemonName(pokemon.speciesId, language, pokemon.name)
        : pokemon.name,
    ability: localizedAbilityName(pokemon.ability, language, pokemon.ability),
    moves: pokemon.moves.map((move) => ({
      ...move,
      name: localizedMoveName(move.id, language, move.name),
    })),
  }
}

export function localizeCollection(
  collection: PokemonCollection,
  language: Language,
): PokemonCollection {
  return { pokemon: collection.pokemon.map((pokemon) => localizePokemon(pokemon, language)) }
}

export function localizeDex(dex: PokemonDex, language: Language): PokemonDex {
  return {
    ...dex,
    pokemon: dex.pokemon.map((pokemon) => ({
      ...pokemon,
      name: localizedPokemonName(pokemon.speciesId, language, pokemon.name),
    })),
  }
}

export function localizeGameState(state: GameState, language: Language): GameState {
  return {
    ...state,
    locale: language,
    party: state.party.map((slot) => ({
      ...slot,
      pokemon: slot.pokemon === null ? null : localizePokemon(slot.pokemon, language),
    })),
    choicePokemon: state.choicePokemon.map((pokemon) => localizePokemon(pokemon, language)),
    pendingEncounter:
      state.pendingEncounter === null
        ? null
        : {
            ...state.pendingEncounter,
            name: localizedPokemonName(
              state.pendingEncounter.speciesId,
              language,
              state.pendingEncounter.name,
            ),
          },
    exploration:
      state.exploration === null
        ? null
        : {
            ...state.exploration,
            regions: state.exploration.regions.map((region) => ({
              ...region,
              name: regions(language).find((entry) => entry.id === region.id)?.name ?? region.name,
              locations: region.locations.map((location) => ({
                ...location,
                name: localizedLocationName(location.id, language, location.name),
              })),
            })),
            locations: state.exploration.locations.map((location) => ({
              ...location,
              name: localizedLocationName(location.id, language, location.name),
            })),
          },
  }
}
