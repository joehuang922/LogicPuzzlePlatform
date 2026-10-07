import { SolverPlugin } from "./types";
import { sudokuPlugin } from "./plugins/sudoku";
import { kakuroPlugin } from "./plugins/kakuro";
import { litsPlugin } from "./plugins/lits";
import { slitherlinkPlugin } from "./plugins/slitherlink";

// A registered plugin with its type parameters erased. The registry is the boundary where
// per-type Canon/Board/Solution shapes meet the generic drivers, so `any` here is
// deliberate: the gate drives each plugin through its own model and serializer, which
// stay internally type-safe. (Plugins keep their precise types at their definition sites.)
type AnyPlugin = SolverPlugin<any, any, any>;

// Registry keyed by puzzleType, mirroring player/frontend/src/progress/index.ts.
// A type with a registered plugin is gated (D8); others bypass until their plugin lands.
const registry = new Map<number, AnyPlugin>();

function register(plugin: AnyPlugin) {
  registry.set(plugin.puzzleType, plugin);
}

register(sudokuPlugin);
register(kakuroPlugin);
register(litsPlugin);
register(slitherlinkPlugin);

export function getPlugin(puzzleType: number): AnyPlugin | undefined {
  return registry.get(puzzleType);
}
