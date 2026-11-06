import { createContext, useContext, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";

/**
 * Board UI memory: view-only board state (paint mode, note mode, zoom, scroll)
 * that should survive the board being remounted.
 *
 * Undo/redo on the Play page restores a board by remounting it with the restored
 * answer (boards own their cell state, seeded once from the answer), which would
 * otherwise reset every toggle the player set. A board keeps a toggle across those
 * remounts by holding it in [useBoardUiState] instead of `useState`. The Play page
 * provides one memory per board session and drops it on a fresh load; outside a
 * provider (editors, the sandbox) the hook is plain `useState`.
 */
const BoardUiMemory = createContext<Map<string, unknown> | null>(null);

export function BoardUiMemoryProvider({ memory, children }: { memory: Map<string, unknown>; children: ReactNode }) {
  return <BoardUiMemory.Provider value={memory}>{children}</BoardUiMemory.Provider>;
}

/** The provided memory, or null outside a Play board session. */
export function useBoardUiMemory(): Map<string, unknown> | null {
  return useContext(BoardUiMemory);
}

/** `useState` whose value is kept in the board UI memory under [key] (see above). */
export function useBoardUiState<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const memory = useContext(BoardUiMemory);
  const [value, setValue] = useState<T>(() => {
    if (memory?.has(key)) return memory.get(key) as T;
    return typeof initial === "function" ? (initial as () => T)() : initial;
  });
  useEffect(() => {
    memory?.set(key, value);
  }, [memory, key, value]);
  return [value, setValue];
}
