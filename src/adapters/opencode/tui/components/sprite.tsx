import { createSignal, Show } from "solid-js"
import type { Language } from "../../../../domain/shared/language.js"
import { uiCopy } from "../../../presentation/ui-copy.js"
import type { SpriteInput, SpriteResolution, SpriteResolver } from "../../../sprites/contracts.js"
import { createOwnerBoundCallback } from "./owner.js"

export function Sprite(properties: {
  readonly resolve: SpriteResolver
  readonly gender: SpriteInput["gender"]
  readonly shiny: boolean
  readonly speciesId: string
  readonly language?: (() => Language) | undefined
  readonly compactFallback?: boolean | undefined
  readonly width?: number | undefined
  readonly height?: number | undefined
}) {
  const [sprite, setSprite] = createSignal<SpriteResolution | null>(null)
  const setSpriteIfOwned = createOwnerBoundCallback(setSprite)
  const width = properties.width ?? 8
  const height = properties.height ?? 4
  void properties
    .resolve(properties.speciesId, properties.shiny, properties.gender)
    .then(setSpriteIfOwned)
  const source = () => {
    const resolved = sprite()
    return resolved?.kind === "cached" ? resolved.source : null
  }
  return (
    <Show
      when={source()}
      fallback={
        <box alignItems="center" height={height} justifyContent="center" width={width}>
          <text>
            {properties.compactFallback === true
              ? sprite() === null
                ? "…"
                : "?"
              : sprite() === null
                ? uiCopy(properties.language?.() ?? "en").loadingSprite
                : uiCopy(properties.language?.() ?? "en").spriteUnavailable}
          </text>
        </box>
      }
    >
      {(cachedSource: () => string) => (
        <image source={cachedSource()} fit="fit" width={width} height={height} />
      )}
    </Show>
  )
}
