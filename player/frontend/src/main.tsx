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
import { slalomRenderer } from "./renderers/slalom";
import { shakashakaRenderer } from "./renderers/shakashaka";
import { kakuroRenderer } from "./renderers/kakuro";
import { yajilinRenderer } from "./renderers/yajilin";
import { fillominoRenderer } from "./renderers/fillomino";
import { litsRenderer } from "./renderers/lits";
import { chocoBananaRenderer } from "./renderers/chocoBanana";
import { numberLinkRenderer } from "./renderers/numberLink";
import { akariRenderer } from "./renderers/akari";
import { hellGolfRenderer } from "./renderers/hellGolf";
import { tentaishowRenderer } from "./renderers/tentaishow";
import { heyawakeRenderer } from "./renderers/heyawake";

registerRenderer(comboSudokuRenderer);
registerRenderer(sudokuRenderer);
registerRenderer(nurimazeRenderer);
registerRenderer(doubleChocoRenderer);
registerRenderer(slitherlinkRenderer);
registerRenderer(nonogramRenderer);
registerRenderer(masyuRenderer);
registerRenderer(pencilsRenderer);
registerRenderer(nuritwinRenderer);
registerRenderer(slalomRenderer);
registerRenderer(shakashakaRenderer);
registerRenderer(kakuroRenderer);
registerRenderer(yajilinRenderer);
registerRenderer(fillominoRenderer);
registerRenderer(litsRenderer);
registerRenderer(chocoBananaRenderer);
registerRenderer(numberLinkRenderer);
registerRenderer(akariRenderer);
registerRenderer(hellGolfRenderer);
registerRenderer(tentaishowRenderer);
registerRenderer(heyawakeRenderer);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
