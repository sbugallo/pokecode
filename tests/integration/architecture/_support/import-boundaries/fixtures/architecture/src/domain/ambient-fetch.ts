declare global {
  function fetch(url: "ambient-global"): string
}

export const useAmbientFetch = () => fetch("ambient-global")
