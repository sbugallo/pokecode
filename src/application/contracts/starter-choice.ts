import type { StarterGameState } from "../ports/starter-selection-store.js"

export type StarterChoiceResult<TState extends StarterGameState> = {
  readonly kind: "selected" | "invalid-region" | "invalid-starter" | "already-selected"
  readonly state: TState
}
