import { SolverPlugin } from "./types";
import { sudokuPlugin } from "./plugins/sudoku";
import { kakuroPlugin } from "./plugins/kakuro";
import { litsPlugin } from "./plugins/lits";
import { slitherlinkPlugin } from "./plugins/slitherlink";
import { nonogramPlugin } from "./plugins/nonogram";
import { comboSudokuPlugin } from "./plugins/combo-sudoku";
import { nurimazePlugin } from "./plugins/nurimaze";
import { masyuPlugin } from "./plugins/masyu";
import { yajilinPlugin } from "./plugins/yajilin";
import { rippleEffectPlugin } from "./plugins/ripple-effect";
import { nuritwinPlugin } from "./plugins/nuritwin";
import { norinoriPlugin } from "./plugins/norinori";
import { hitoriPlugin } from "./plugins/hitori";
import { heyawakePlugin } from "./plugins/heyawake";
import { nurikabePlugin } from "./plugins/nurikabe";
import { cornerChainPlugin } from "./plugins/corner-chain";
import { akariPlugin } from "./plugins/akari";
import { fillominoPlugin } from "./plugins/fillomino";
import { pencilsPlugin } from "./plugins/pencils";
import { shikakuPlugin } from "./plugins/shikaku";
import { picturesqueMazePlugin } from "./plugins/picturesque-maze";

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
register(nonogramPlugin);
register(comboSudokuPlugin);
register(nurimazePlugin);
register(masyuPlugin);
register(yajilinPlugin);
register(rippleEffectPlugin);
register(nuritwinPlugin);
register(norinoriPlugin);
register(hitoriPlugin);
register(heyawakePlugin);
register(nurikabePlugin);
register(cornerChainPlugin);
register(akariPlugin);
register(fillominoPlugin);
register(pencilsPlugin);
register(shikakuPlugin);
register(picturesqueMazePlugin);

export function getPlugin(puzzleType: number): AnyPlugin | undefined {
  return registry.get(puzzleType);
}

/** Every puzzle type with a registered solver, e.g. for the backfill's row filter. */
export function registeredPuzzleTypes(): number[] {
  return [...registry.keys()].sort((a, b) => a - b);
}
