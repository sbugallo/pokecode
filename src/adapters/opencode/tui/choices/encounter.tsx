import type { GameState } from "../../../../application/contracts/game.js"
import type { PendingEncounter } from "../../../../domain/encounters/encounter.js"
import { uiCopy } from "../../../presentation/ui-copy.js"
import type { SpriteResolver } from "../../../sprites/contracts.js"
import { PokecodeActionButton } from "../components/action-button.js"
import type { ImageProtocolAccessor } from "../components/image-protocol.js"
import { Sprite } from "../components/sprite.js"

export function EncounterCard(properties: {
  readonly encounter: () => GameState["pendingEncounter"]
  readonly mutedColor: () => string
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
}) {
  const encounter = properties.encounter()
  if (encounter === null) return null
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
        <text fg={properties.encounter()?.caught ? "#22c55e" : properties.mutedColor()}>● </text>
        <text>
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
          tone="primary"
        />
        <PokecodeActionButton
          hovered={() => properties.hoveredAction() === "run"}
          label={copy.run}
          onActivate={() => properties.onResolve(encounter.id, encounter, false)}
          onHover={() => properties.onHover("run")}
          onLeave={() => properties.onHover(null)}
          tone="secondary"
        />
      </box>
    </box>
  )
}
