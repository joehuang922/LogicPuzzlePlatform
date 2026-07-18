import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { registerRenderer } from "./components/PuzzleBoard";
import { comboSudokuRenderer } from "./renderers/comboSudoku";
import { sudokuRenderer } from "./renderers/sudoku";
import { nurimazeRenderer } from "./renderers/nurimaze";
import { doubleChocoRenderer } from "./renderers/doubleChoco";
import { slitherlinkRenderer } from "./renderers/slitherlink";
import { nonogramRenderer } from "./renderers/nonogram";
import { masyuRenderer } from "./renderers/masyu";
import { pencilsRenderer } from "./renderers/pencils";
import { nuritwinRenderer } from "./renderers/nuritwin";

registerRenderer(comboSudokuRenderer);
registerRenderer(sudokuRenderer);
registerRenderer(nurimazeRenderer);
registerRenderer(doubleChocoRenderer);
registerRenderer(slitherlinkRenderer);
registerRenderer(nonogramRenderer);
registerRenderer(masyuRenderer);
registerRenderer(pencilsRenderer);
registerRenderer(nuritwinRenderer);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
