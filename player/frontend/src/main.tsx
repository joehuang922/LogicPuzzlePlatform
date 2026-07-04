import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { registerRenderer } from "./components/PuzzleBoard";
import { comboSudokuRenderer } from "./renderers/comboSudoku";

registerRenderer(comboSudokuRenderer);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
