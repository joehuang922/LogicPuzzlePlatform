import { SolverPlugin } from "./types";
import { sudokuPlugin } from "./plugins/sudoku";

// Registry keyed by puzzleType, mirroring player/frontend/src/progress/index.ts.
// A type with a registered plugin is gated (D8); others bypass until their plugin lands.
const registry = new Map<number, SolverPlugin>();

function register(plugin: SolverPlugin) {
  registry.set(plugin.puzzleType, plugin);
}

register(sudokuPlugin as SolverPlugin);

export function getPlugin(puzzleType: number): SolverPlugin | undefined {
  return registry.get(puzzleType);
}
