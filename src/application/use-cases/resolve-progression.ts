import { evolutionAtLevel, movesAtLevel, progressionFor } from "../../domain/progression/catalog.js"
import { nextLevelAdvance } from "../../domain/progression/policies.js"
import type {
  PartyProgressPokemon,
  ProgressionTransactionStores,
} from "../ports/game-transaction.js"
import { learnMove } from "./learn-move.js"

export function resolveUsageLevels(
  stores: ProgressionTransactionStores,
  trainerId: string,
  regionId: string | null,
  createdAt: string,
  createId: () => string,
): void {
  for (const pokemon of stores.pokemon.party(trainerId)) {
    resolvePokemonLevels(stores, trainerId, pokemon, regionId, createdAt, createId)
  }
}

/** Resume saved progression for one owned Pokémon, including one in the PC. */
export function resolveOwnedPokemonLevels(
  stores: ProgressionTransactionStores,
  trainerId: string,
  pokemonId: string,
  regionId: string | null,
  createdAt: string,
  createId: () => string,
): void {
  const pokemon = stores.pokemon.findOwned(trainerId, pokemonId)
  if (pokemon === null) return
  resolvePokemonLevels(stores, trainerId, pokemon, regionId, createdAt, createId)
}

/** Preserve party resumption and additionally drain deferred XP on PC Pokémon. */
export function resolveUnblockedPokemonLevels(
  stores: ProgressionTransactionStores,
  trainerId: string,
  regionId: string | null,
  createdAt: string,
  createId: () => string,
): void {
  resolveUsageLevels(stores, trainerId, regionId, createdAt, createId)
  for (const pokemon of stores.pokemon.offPartyWithExperience(trainerId)) {
    resolvePokemonLevels(stores, trainerId, pokemon, regionId, createdAt, createId)
  }
}

/** Process saved XP only, excluding untouched party/PC Pokémon from queue-drain side effects. */
export function resolveSavedExperienceLevels(
  stores: ProgressionTransactionStores,
  trainerId: string,
  regionId: string | null,
  createdAt: string,
  createId: () => string,
): void {
  const partyWithExperience = stores.pokemon
    .party(trainerId)
    .filter((pokemon) => pokemon.experience > 0)
  for (const pokemon of [
    ...partyWithExperience,
    ...stores.pokemon.offPartyWithExperience(trainerId),
  ]) {
    resolvePokemonLevels(stores, trainerId, pokemon, regionId, createdAt, createId)
  }
}

function resolvePokemonLevels(
  stores: ProgressionTransactionStores,
  trainerId: string,
  pokemon: PartyProgressPokemon,
  regionId: string | null,
  createdAt: string,
  createId: () => string,
): void {
  let speciesId = pokemon.speciesId
  let level = pokemon.level
  let experience = pokemon.experience
  while (true) {
    // Check the current level too: captures and newly evolved species may have
    // already passed their milestone, including the Azurill -> Marill chain.
    const evolution = evolutionAtLevel(speciesId, level, pokemon.gender, regionId)
    if (evolution !== null) {
      if (evolution.targets.length > 1) {
        if (!stores.choices.hasPokemonChoice(trainerId, pokemon.id, "evolution")) {
          stores.choices.insert({
            id: createId(),
            trainerId,
            kind: "evolution",
            payload: { pokemonId: pokemon.id, options: [...evolution.targets] },
            createdAt,
          })
        }
        // Keep the remaining XP on the Pokémon until its species is selected.
        return
      }
      const target = evolution.targets[0]
      speciesId = target.speciesId
      stores.pokemon.evolve(pokemon.id, target.speciesId, target.name)
      for (const move of movesAtLevel(speciesId, level)) {
        learnMove(stores, { trainerId, pokemonId: pokemon.id, move, createdAt, createId })
      }
      continue
    }

    const advance = nextLevelAdvance({
      level,
      experience,
      growthRate: progressionFor(speciesId).growthRate,
    })
    if (advance === null) return
    level = advance.level
    experience = advance.experience
    stores.pokemon.setLevel(pokemon.id, level, experience)
    for (const move of movesAtLevel(speciesId, level)) {
      learnMove(stores, { trainerId, pokemonId: pokemon.id, move, createdAt, createId })
    }
  }
}
