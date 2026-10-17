import { validatePartyReplacement } from "../../domain/party/party.js"
import type { PartyReplacementResult, PokemonManagementResult } from "../contracts/game.js"
import {
  afterGameTransaction,
  type GameCommandDependencies,
  resumeUnblockedProgression,
} from "./game-command-support.js"

export function createPartyCommands(dependencies: GameCommandDependencies) {
  const replaceParty = (pokemonIds: readonly string[]): PartyReplacementResult =>
    afterGameTransaction(dependencies, (stores) => {
      const trainer = stores.trainers.find()
      if (trainer === null) return "inactive"
      const shape = validatePartyReplacement({ pokemonIds })
      if (!shape.valid) return "invalid-party"
      const ownedPokemonCount = stores.commands.pokemon.ownedCount(trainer.id, pokemonIds)
      if (!validatePartyReplacement({ pokemonIds, ownedPokemonCount }).valid) return "invalid-party"
      stores.commands.pokemon.replaceParty(trainer.id, pokemonIds)
      return "replaced"
    })

  const renamePokemon = (pokemonId: string, name: string): PokemonManagementResult =>
    afterGameTransaction(dependencies, (stores) => {
      const trainer = stores.trainers.find()
      if (trainer === null) return "inactive"
      if (stores.pokemon.findOwned(trainer.id, pokemonId) === null) return "invalid-pokemon"
      const trimmed = name.trim()
      if (trimmed.length === 0 || trimmed.length > 30 || /[\p{Cc}\p{Cf}]/u.test(trimmed))
        return "invalid-name"
      stores.commands.pokemon.rename(trainer.id, pokemonId, trimmed)
      return "renamed"
    })

  const releasePokemon = (pokemonId: string): PokemonManagementResult =>
    afterGameTransaction(dependencies, (stores) => {
      const trainer = stores.trainers.find()
      if (trainer === null) return "inactive"
      if (stores.pokemon.findOwned(trainer.id, pokemonId) === null) return "invalid-pokemon"
      const party = stores.pokemon.party(trainer.id)
      if (party.length === 1 && party[0]?.id === pokemonId) return "last-party-pokemon"
      stores.commands.pokemon.release(trainer.id, pokemonId)
      resumeUnblockedProgression(dependencies, stores, trainer.id, trainer.regionId)
      return "released"
    })

  return { replaceParty, renamePokemon, releasePokemon }
}
