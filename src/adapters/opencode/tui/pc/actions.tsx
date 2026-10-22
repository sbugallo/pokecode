import type { Context } from "@opencode/plugin/tui/context"
import { createSignal } from "solid-js"
import type { PokemonCollection } from "../../../../application/contracts/game.js"
import type { SpriteResolver } from "../../../sprites/contracts.js"
import type { createPokemonTuiClient } from "../client.js"
import type { ImageProtocolAccessor } from "../components/image-protocol.js"
import type { createTuiStateCoordinator } from "../state/coordinator.js"
import { PokemonPcDialog } from "./dialog.js"

type TuiClient = ReturnType<typeof createPokemonTuiClient>
type TuiState = ReturnType<typeof createTuiStateCoordinator>

export function createPartyReplacementConfirmation(dependencies: {
  readonly rpc: TuiClient
  readonly state: TuiState
}) {
  return async (pokemonIds: readonly string[]): Promise<boolean> => {
    const result = await dependencies.rpc.replaceParty({ pokemonIds: [...pokemonIds] })
    dependencies.state.apply(result.state)
    return !dependencies.state.isDisposed() && result.kind === "replaced"
  }
}

export function createPcAction(dependencies: {
  readonly rpc: TuiClient
  readonly state: TuiState
  readonly dialog: Pick<Context["ui"]["dialog"], "show" | "set" | "clear">
  readonly theme: { readonly base: () => string; readonly muted: () => string }
  readonly resolveSprite: SpriteResolver
  readonly imageProtocol: ImageProtocolAccessor
}) {
  const onConfirm = createPartyReplacementConfirmation({
    rpc: dependencies.rpc,
    state: dependencies.state,
  })
  return async (): Promise<void> => {
    const collection = await dependencies.rpc.collection({})
    if (dependencies.state.isDisposed()) return
    const [pokemon, setPokemon] = createSignal(collection.pokemon)
    const manage = async (
      operation: ReturnType<TuiClient["renamePokemon"]>,
      update: (pokemon: PokemonCollection["pokemon"]) => PokemonCollection["pokemon"],
    ) => {
      const result = await operation
      dependencies.state.apply(result.state)
      if (!dependencies.state.isDisposed() && ["renamed", "released"].includes(result.kind)) {
        // The mutation is already committed. Keep it visible even if the refresh fails.
        setPokemon(update)
        try {
          const collection = await dependencies.rpc.collection({})
          if (!dependencies.state.isDisposed()) setPokemon(collection.pokemon)
        } catch {
          // A later PC opening will refresh any progression changes to other Pokemon.
        }
      }
      return result.kind
    }
    const partyIds = dependencies.state
      .state()
      .party.flatMap((slot) => (slot.pokemon === null ? [] : [slot.pokemon.id]))
    dependencies.dialog.show(() => (
      <PokemonPcDialog
        pokemon={pokemon()}
        partyIds={partyIds}
        language={dependencies.state.state().locale}
        textColor={dependencies.theme.base}
        mutedColor={dependencies.theme.muted}
        resolveSprite={dependencies.resolveSprite}
        imageProtocol={dependencies.imageProtocol}
        onClose={() => {
          if (!dependencies.state.isDisposed()) dependencies.dialog.clear()
        }}
        onConfirm={onConfirm}
        onRename={(pokemonId, name) =>
          manage(dependencies.rpc.renamePokemon({ pokemonId, name }), (pokemon) =>
            pokemon.map((entry) =>
              entry.id === pokemonId ? { ...entry, name: name.trim() } : entry,
            ),
          )
        }
        onRelease={(pokemonId) =>
          manage(dependencies.rpc.releasePokemon({ pokemonId }), (pokemon) =>
            pokemon.filter((entry) => entry.id !== pokemonId),
          )
        }
      />
    ))
    dependencies.dialog.set({ size: "large", centered: true })
  }
}
