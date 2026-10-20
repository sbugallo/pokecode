import { regions } from "../../domain/content/catalog.js"
import { evolutionAtLevel, movesAtLevel } from "../../domain/progression/catalog.js"
import { moveReplacementDecision } from "../../domain/progression/policies.js"
import type { ChoiceResolutionResult, GameState } from "../contracts/game.js"
import {
  afterGameTransaction,
  type GameCommandDependencies,
  resumeUnblockedProgression,
} from "./game-command-support.js"
import { learnMove } from "./learn-move.js"
import { resolveOwnedPokemonLevels } from "./resolve-progression.js"

export function createChoiceCommands(dependencies: GameCommandDependencies) {
  // Retain the RPC for older clients, but unlocking a region is no longer dismissible.
  const dismissNextRegionChoice = (): GameState => dependencies.readState()

  const reopenNextRegionChoice = (createdAt: string): GameState => {
    dependencies.transactions.withTransaction((stores) => {
      const trainer = stores.trainers.find()
      if (trainer === null) return
      if (!stores.commands.exploration.regionCompleted(trainer.id, trainer.regionId)) return
      if (
        regions().every((region) =>
          stores.commands.exploration.regionVisited(trainer.id, region.id),
        )
      )
        return
      if (stores.commands.choices.hasKind(trainer.id, "region")) return
      stores.choices.insert({
        id: dependencies.createId(),
        trainerId: trainer.id,
        kind: "region",
        payload: { region: trainer.regionId },
        createdAt,
      })
      stores.commands.exploration.setRegionDismissed(trainer.id, trainer.regionId, false)
    })
    return dependencies.readState()
  }

  const resolveMoveChoice = (
    choiceId: string,
    selectedMoveId: string,
    createdAt: string,
  ): ChoiceResolutionResult =>
    afterGameTransaction(dependencies, (stores) => {
      const trainer = stores.trainers.find()
      if (trainer === null) return "inactive"
      const choice = stores.commands.choices.find(trainer.id, choiceId, "move")
      if (choice?.kind !== "move") return "invalid-choice"
      const { pokemonId, move } = choice.payload
      const currentMoves = stores.pokemon.moves(pokemonId)
      // Another queued decision may have taught this move first. Resolve the
      // stale prompt without replacing a move with a duplicate.
      if (currentMoves.some((current) => current.id === move.id)) {
        stores.commands.choices.delete(choiceId)
        resumeUnblockedProgression(dependencies, stores, trainer.id, trainer.regionId, createdAt)
        return "resolved"
      }
      const decision = moveReplacementDecision(currentMoves, move.id, selectedMoveId)
      if (decision.kind === "invalid") return "invalid-choice"
      if (decision.kind === "replace")
        stores.commands.pokemon.replaceMove(pokemonId, decision.position, move)
      stores.commands.choices.delete(choiceId)
      resumeUnblockedProgression(dependencies, stores, trainer.id, trainer.regionId, createdAt)
      return "resolved"
    })

  const resolveEvolutionChoice = (
    choiceId: string,
    selectedSpeciesId: string,
    createdAt: string,
  ): ChoiceResolutionResult =>
    afterGameTransaction(dependencies, (stores) => {
      const trainer = stores.trainers.find()
      if (trainer === null) return "inactive"
      const choice = stores.commands.choices.find(trainer.id, choiceId, "evolution")
      if (choice?.kind !== "evolution") return "invalid-choice"
      const target = choice.payload.options.find((option) => option.speciesId === selectedSpeciesId)
      if (target === undefined) return "invalid-choice"
      const pokemon = stores.pokemon.findOwned(trainer.id, choice.payload.pokemonId)
      if (pokemon === null) return "invalid-choice"
      const evolution = evolutionAtLevel(
        pokemon.speciesId,
        pokemon.level,
        pokemon.gender,
        trainer.regionId,
      )
      const eligible = evolution?.targets.some((option) => option.speciesId === selectedSpeciesId)
      // Older saves may contain branches that are no longer eligible. Retire
      // obsolete prompts and let normal progression handle zero or one target.
      if (evolution === null || evolution.targets.length === 1) {
        stores.commands.choices.delete(choiceId)
        resolveOwnedPokemonLevels(
          stores,
          trainer.id,
          pokemon.id,
          trainer.regionId,
          createdAt,
          dependencies.createId,
        )
        resumeUnblockedProgression(dependencies, stores, trainer.id, trainer.regionId, createdAt)
        return eligible ? "resolved" : "invalid-choice"
      }
      if (!eligible) return "invalid-choice"
      stores.pokemon.evolve(choice.payload.pokemonId, target.speciesId, target.name)
      // The evolved species is now owned, so it counts as seen and caught.
      stores.pokemon.markCaught(trainer.id, target.speciesId)
      const level = stores.commands.pokemon.level(choice.payload.pokemonId)
      if (level !== null) {
        for (const move of movesAtLevel(target.speciesId, level)) {
          learnMove(stores, {
            trainerId: trainer.id,
            pokemonId: choice.payload.pokemonId,
            move,
            createdAt,
            createId: dependencies.createId,
          })
        }
      }
      stores.commands.choices.delete(choiceId)
      if (dependencies.pauseOnPendingChoice) {
        resumeUnblockedProgression(dependencies, stores, trainer.id, trainer.regionId, createdAt)
      } else {
        resolveOwnedPokemonLevels(
          stores,
          trainer.id,
          choice.payload.pokemonId,
          trainer.regionId,
          createdAt,
          dependencies.createId,
        )
      }
      return "resolved"
    })

  return {
    dismissNextRegionChoice,
    reopenNextRegionChoice,
    resolveMoveChoice,
    resolveEvolutionChoice,
  }
}
