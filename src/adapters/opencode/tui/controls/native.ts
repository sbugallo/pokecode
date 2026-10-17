import { BoxRenderable, RenderableEvents } from "@opentui/core"
import { extend } from "@opentui/solid"

type FocusHandler = () => void

class StarterButtonRenderable extends BoxRenderable {
  #onBlur: FocusHandler | undefined
  #onFocus: FocusHandler | undefined

  set onBlur(handler: FocusHandler | undefined) {
    if (this.#onBlur !== undefined) this.off(RenderableEvents.BLURRED, this.#onBlur)
    this.#onBlur = handler
    if (handler !== undefined) this.on(RenderableEvents.BLURRED, handler)
  }

  set onFocus(handler: FocusHandler | undefined) {
    if (this.#onFocus !== undefined) this.off(RenderableEvents.FOCUSED, this.#onFocus)
    this.#onFocus = handler
    if (handler !== undefined) this.on(RenderableEvents.FOCUSED, handler)
  }
}

extend({ button: StarterButtonRenderable })
