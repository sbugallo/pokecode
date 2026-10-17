import { createSignal } from "solid-js"
import { type GameState, gameStateSchema } from "../../../../application/contracts/game.js"
import {
  type GameNotification,
  gameNotifications,
} from "../../../presentation/game-notifications.js"

export function initialTuiState(): GameState {
  return gameStateSchema.parse({
    phase: "onboarding",
    message: "Loading PokéCode...",
    region: null,
    location: null,
    party: [1, 2, 3, 4, 5, 6].map((position) => ({ position, pokemon: null })),
    pendingChoices: [],
    exploration: null,
  })
}

export function createTuiStateCoordinator(
  initial: GameState,
  notify: (notification: GameNotification) => void,
) {
  const [state, setState] = createSignal<GameState>(initial)
  let disposed = false

  return {
    state,
    initialize(next: GameState): void {
      if (!disposed) setState(next)
    },
    apply(next: GameState): void {
      if (disposed) return
      const notifications = gameNotifications(state(), next)
      setState(next)
      for (const notification of notifications) notify(notification)
    },
    dispose(): void {
      disposed = true
    },
    isDisposed(): boolean {
      return disposed
    },
  }
}
