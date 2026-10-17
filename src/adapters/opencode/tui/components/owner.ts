import { onCleanup } from "solid-js"

export function createOwnerGuard(): () => boolean {
  let owned = true
  onCleanup(() => {
    owned = false
  })
  return () => owned
}

export function createOwnerBoundCallback<Value>(callback: (value: Value) => void) {
  const isOwned = createOwnerGuard()
  return (value: Value): void => {
    if (isOwned()) callback(value)
  }
}
