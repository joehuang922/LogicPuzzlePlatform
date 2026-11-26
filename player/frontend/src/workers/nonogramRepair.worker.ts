/**
 * Runs the big-nonogram clue repair off the page's thread: on a phone the
 * search takes tens of seconds and would otherwise freeze the page.
 *
 * In: { rows: RepairLine[], cols: RepairLine[] }.
 * Out: { progress: string } while working, then { result: RepairResult }.
 */
import { RepairLine, autoRepair } from "../utils/nonogramStrips";

// The project's TS lib is DOM's; inside a worker `self` is the worker scope.
const scope = self as unknown as {
  postMessage(message: unknown): void;
  onmessage: ((e: MessageEvent<{ rows: RepairLine[]; cols: RepairLine[] }>) => void) | null;
};

scope.onmessage = async (e) => {
  try {
    const result = await autoRepair(e.data.rows, e.data.cols, (progress) => scope.postMessage({ progress }));
    scope.postMessage({ result });
  } catch (err) {
    scope.postMessage({ error: err instanceof Error ? err.message : String(err) });
  }
};
