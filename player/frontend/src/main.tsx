import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { registerRenderer } from "./components/PuzzleBoard";
import { comboSudokuRenderer } from "./renderers/comboSudoku";
import { sudokuRenderer } from "./renderers/sudoku";
import { nurimazeRenderer } from "./renderers/nurimaze";
import { doubleChocoRenderer } from "./renderers/doubleChoco";

registerRenderer(comboSudokuRenderer);
registerRenderer(sudokuRenderer);
registerRenderer(nurimazeRenderer);
registerRenderer(doubleChocoRenderer);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
