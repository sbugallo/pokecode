import type { GameState } from "../../../../application/contracts/game.js"
import type { PendingEncounter } from "../../../../domain/encounters/encounter.js"
import { uiCopy } from "../../../presentation/ui-copy.js"
import type { SpriteResolver } from "../../../sprites/contracts.js"
import { PokecodeActionButton } from "../components/action-button.js"
import type { ImageProtocolAccessor } from "../components/image-protocol.js"
import { Sprite } from "../components/sprite.js"
import { fallbackPokecodeTheme, type PokecodeSurface } from "../theme.js"

export function EncounterCard(properties: {
  readonly encounter: () => GameState["pendingEncounter"]
  readonly hoveredAction: () => "catch" | "run" | null
  readonly onHover: (action: "catch" | "run" | null) => void
  readonly onResolve: (
    encounterId: string,
    encounter: PendingEncounter,
    capture: boolean,
  ) => Promise<void>
  readonly resolveSprite: SpriteResolver
  readonly imageProtocol: ImageProtocolAccessor
  readonly language?: (() => GameState["locale"]) | undefined
  readonly theme?: (() => PokecodeSurface) | undefined
}) {
  const encounter = properties.encounter()
  if (encounter === null) return null
  const surface = () => properties.theme?.() ?? fallbackPokecodeTheme.current
  const genderSymbol = encounter.gender === "male" ? "♂" : encounter.gender === "female" ? "♀" : "—"
  const copy = uiCopy(properties.language?.() ?? "en")
  return (
    <box
      alignItems="center"
      border
      borderStyle="rounded"
      flexDirection="column"
      gap={1}
      padding={1}
    >
      <box flexDirection="row">
        <text fg={properties.encounter()?.caught ? surface().success : surface().muted}>● </text>
        <text fg={surface().text}>
          {copy.encounter({
            genderSymbol,
            kind: encounter.kind,
            level: encounter.level,
            name: encounter.name,
            shiny: encounter.shiny,
          })}
        </text>
      </box>
      <Sprite
        language={properties.language}
        resolve={properties.resolveSprite}
        protocol={properties.imageProtocol}
        theme={surface}
        shiny={encounter.shiny}
        gender={encounter.gender}
        speciesId={encounter.speciesId}
      />
      <box flexDirection="row" gap={1} justifyContent="center">
        <PokecodeActionButton
          hovered={() => properties.hoveredAction() === "catch"}
          label={copy.catch}
          onActivate={() => properties.onResolve(encounter.id, encounter, true)}
          onHover={() => properties.onHover("catch")}
          onLeave={() => properties.onHover(null)}
          theme={surface}
          tone="primary"
        />
        <PokecodeActionButton
          hovered={() => properties.hoveredAction() === "run"}
          label={copy.run}
          onActivate={() => properties.onResolve(encounter.id, encounter, false)}
          onHover={() => properties.onHover("run")}
          onLeave={() => properties.onHover(null)}
          theme={surface}
          tone="secondary"
        />
      </box>
    </box>
  )
}
