import type { Database } from "bun:sqlite"
import type {
  GameTransactionRunner,
  GameTransactionStores,
} from "../../application/ports/game-transaction.js"
import { createChoiceTransactionStore } from "./transaction-stores/choices.js"
import { createEncounterTransactionStore } from "./transaction-stores/encounters.js"
import { createExplorationTransactionStore } from "./transaction-stores/exploration.js"
import { createPokemonTransactionStore } from "./transaction-stores/pokemon.js"
import { createReceiptStore } from "./transaction-stores/receipts.js"
import { createTrainerTransactionStore } from "./transaction-stores/trainers.js"

export function createSqliteGameTransactionStores(database: Database): GameTransactionStores {
  const choices = createChoiceTransactionStore(database)
  const pokemon = createPokemonTransactionStore(database)
  const exploration = createExplorationTransactionStore(database)
  const encounters = createEncounterTransactionStore(database)

  return {
    receipts: createReceiptStore(database),
    trainers: createTrainerTransactionStore(database),
    choices: choices.usage,
    pokemon: pokemon.usage,
    exploration: exploration.usage,
    encounters: encounters.usage,
    commands: {
      choices: choices.commands,
      pokemon: pokemon.commands,
      exploration: exploration.commands,
      encounters: encounters.commands,
    },
  }
}

export function createSqliteGameTransactionRunner(database: Database): GameTransactionRunner {
  return {
    withTransaction: (work) => {
      const transaction = database.transaction(() =>
        work(createSqliteGameTransactionStores(database)),
      )
      return transaction.immediate()
    },
  }
}
