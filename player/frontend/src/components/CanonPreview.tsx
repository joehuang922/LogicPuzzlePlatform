import SudokuBoard from "./SudokuBoard";
import ComboSudokuBoard from "./ComboSudokuBoard";
import NurimazeBoard from "./NurimazeBoard";
import DoubleChocoBoard from "./DoubleChocoBoard";
import SlitherlinkBoard from "./SlitherlinkBoard";
import NonogramBoard from "./NonogramBoard";
import MasyuBoard from "./MasyuBoard";
import PencilsBoard from "./PencilsBoard";
import NuritwinBoard from "./NuritwinBoard";
import SlalomBoard from "./SlalomBoard";
import ShakashakaBoard from "./ShakashakaBoard";
import KakuroBoard from "./KakuroBoard";
import YajilinBoard from "./YajilinBoard";
import FillominoBoard from "./FillominoBoard";
import LitsBoard from "./LitsBoard";
import ChocoBananaBoard from "./ChocoBananaBoard";
import NumberLinkBoard from "./NumberLinkBoard";
import AkariBoard from "./AkariBoard";
import HellGolfBoard from "./HellGolfBoard";
import TentaishowBoard from "./TentaishowBoard";
import HeyawakeBoard from "./HeyawakeBoard";
import ShikakuBoard from "./ShikakuBoard";
import NorinoriBoard from "./NorinoriBoard";
import NurikabeBoard from "./NurikabeBoard";
import RippleEffectBoard from "./RippleEffectBoard";
import HitoriBoard from "./HitoriBoard";
import PictoLinkBoard from "./PictoLinkBoard";
import KuralinBoard from "./KuralinBoard";
import UnequalSudokuBoard from "./UnequalSudokuBoard";
import CornerChainBoard from "./CornerChainBoard";
import SinkaminoBoard from "./SinkaminoBoard";
import BalanceLinkBoard from "./BalanceLinkBoard";
import LRingBoard from "./LRingBoard";
import PerfectLRingBoard from "./PerfectLRingBoard";
import MannequinGate2Board from "./MannequinGate2Board";
import HashiBoard from "./HashiBoard";
import SkeletonPuzzleBoard from "./SkeletonPuzzleBoard";
import ZebraRopeBoard from "./ZebraRopeBoard";
import WhimsicalKnightBoard from "./WhimsicalKnightBoard";
import OminoTreeBoard from "./OminoTreeBoard";
import MinusRoomBoard from "./MinusRoomBoard";
import TilePaintBoard from "./TilePaintBoard";
import CountryRoadBoard from "./CountryRoadBoard";
import PicturesqueMazeBoard from "./PicturesqueMazeBoard";
import IrregularNonogramBoard from "./IrregularNonogramBoard";
import { NurimazeCanon, DoubleChocoCanon, SlitherlinkCanon, NonogramCanon, MasyuCanon, PencilsCanon, NuritwinCanon, SlalomCanon, ShakashakaCanon, KakuroCanon, YajilinCanon, FillominoCanon, LitsCanon, ChocoBananaCanon, NumberLinkCanon, AkariCanon, HellGolfCanon, TentaishowCanon, HeyawakeCanon, ShikakuCanon, NorinoriCanon, NurikabeCanon, RippleEffectCanon, HitoriCanon, PictoLinkCanon, KuralinCanon, UnequalSudokuCanon, CornerChainCanon, SinkaminoCanon, BalanceLinkCanon, LRingCanon, PerfectLRingCanon, MannequinGate2Canon, HashiCanon, SkeletonPuzzleCanon, ZebraRopeCanon, WhimsicalKnightCanon, OminoTreeCanon, MinusRoomCanon, TilePaintCanon, CountryRoadCanon, PicturesqueMazeCanon, IrregularNonogramCanon } from "../types/canon";

export default function CanonPreview({ puzzleType, canonRepr }: { puzzleType: number; canonRepr: string }) {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(canonRepr);
  } catch {
    return null;
  }

  if (puzzleType === 1 && parsed.hints) {
    return (
      <SudokuBoard
        hints={parsed.hints as number[][]}
        roomWidth={(parsed.room_width as number | undefined) ?? 3}
        roomHeight={(parsed.room_height as number | undefined) ?? 3}
      />
    );
  }
  if (puzzleType === 2 && parsed.subboards) {
    return <ComboSudokuBoard subboards={parsed.subboards as { x: number; y: number; hints: number[][] }[]} />;
  }
  if (puzzleType === 3 && parsed.cells && parsed.grids) {
    return <NurimazeBoard canon={parsed as unknown as NurimazeCanon} readonly />;
  }
  if (puzzleType === 4 && parsed.cells) {
    return <DoubleChocoBoard canon={parsed as unknown as DoubleChocoCanon} readonly />;
  }
  if (puzzleType === 5 && parsed.cells) {
    return <SlitherlinkBoard canon={parsed as unknown as SlitherlinkCanon} readonly />;
  }
  if (puzzleType === 6 && parsed.rowClues && parsed.colClues) {
    return <NonogramBoard canon={parsed as unknown as NonogramCanon} readonly />;
  }
  if (puzzleType === 7 && parsed.cells) {
    return <MasyuBoard canon={parsed as unknown as MasyuCanon} readonly />;
  }
  if (puzzleType === 8 && parsed.cells) {
    return <PencilsBoard canon={parsed as unknown as PencilsCanon} readonly />;
  }
  if (puzzleType === 9 && parsed.cells && parsed.grids) {
    return <NuritwinBoard canon={parsed as unknown as NuritwinCanon} readonly />;
  }
  if (puzzleType === 10 && parsed.cells && parsed.gates) {
    return <SlalomBoard canon={parsed as unknown as SlalomCanon} readonly />;
  }
  if (puzzleType === 11 && parsed.cells) {
    return <ShakashakaBoard canon={parsed as unknown as ShakashakaCanon} readonly />;
  }
  if (puzzleType === 12 && parsed.cells) {
    return <KakuroBoard canon={parsed as unknown as KakuroCanon} readonly />;
  }
  if (puzzleType === 13 && parsed.cells) {
    return <YajilinBoard canon={parsed as unknown as YajilinCanon} readonly />;
  }
  if (puzzleType === 14 && parsed.cells) {
    return <FillominoBoard canon={parsed as unknown as FillominoCanon} readonly />;
  }
  if (puzzleType === 15 && parsed.grids) {
    return <LitsBoard canon={parsed as unknown as LitsCanon} readonly />;
  }
  if (puzzleType === 16 && parsed.cells) {
    return <ChocoBananaBoard canon={parsed as unknown as ChocoBananaCanon} readonly />;
  }
  if (puzzleType === 17 && parsed.cells) {
    return <NumberLinkBoard canon={parsed as unknown as NumberLinkCanon} readonly />;
  }
  if (puzzleType === 18 && parsed.cells) {
    return <AkariBoard canon={parsed as unknown as AkariCanon} readonly />;
  }
  if (puzzleType === 19 && parsed.lakes) {
    return <HellGolfBoard canon={parsed as unknown as HellGolfCanon} readonly />;
  }
  if (puzzleType === 20 && parsed.dots) {
    return <TentaishowBoard canon={parsed as unknown as TentaishowCanon} readonly />;
  }
  if (puzzleType === 21 && parsed.rooms) {
    return <HeyawakeBoard canon={parsed as unknown as HeyawakeCanon} readonly />;
  }
  if (puzzleType === 22 && parsed.cells) {
    return <ShikakuBoard canon={parsed as unknown as ShikakuCanon} readonly />;
  }
  if (puzzleType === 23 && parsed.grids) {
    return <NorinoriBoard canon={parsed as unknown as NorinoriCanon} readonly />;
  }
  if (puzzleType === 24 && parsed.cells) {
    return <NurikabeBoard canon={parsed as unknown as NurikabeCanon} readonly />;
  }
  if (puzzleType === 25 && parsed.cells && parsed.edges) {
    return <RippleEffectBoard canon={parsed as unknown as RippleEffectCanon} readonly />;
  }
  if (puzzleType === 26 && parsed.cells) {
    return <HitoriBoard canon={parsed as unknown as HitoriCanon} readonly />;
  }
  if (puzzleType === 27 && parsed.cells) {
    return <PictoLinkBoard canon={parsed as unknown as PictoLinkCanon} readonly />;
  }
  if (puzzleType === 28 && parsed.circles) {
    return <KuralinBoard canon={parsed as unknown as KuralinCanon} readonly />;
  }
  if (puzzleType === 29 && parsed.hints && parsed.right && parsed.down) {
    return <UnequalSudokuBoard canon={parsed as unknown as UnequalSudokuCanon} readonly />;
  }
  if (puzzleType === 30 && parsed.cells) {
    return <CornerChainBoard canon={parsed as unknown as CornerChainCanon} readonly />;
  }
  if (puzzleType === 31 && parsed.cells && parsed.arrows) {
    return <SinkaminoBoard canon={parsed as unknown as SinkaminoCanon} readonly />;
  }
  if (puzzleType === 32 && parsed.cells) {
    return <BalanceLinkBoard canon={parsed as unknown as BalanceLinkCanon} readonly />;
  }
  if (puzzleType === 33 && parsed.cells) {
    return <LRingBoard canon={parsed as unknown as LRingCanon} readonly />;
  }
  if (puzzleType === 42 && parsed.cells) {
    return <PerfectLRingBoard canon={parsed as unknown as PerfectLRingCanon} readonly />;
  }
  if (puzzleType === 43 && Array.isArray(parsed.lines)) {
    return <MannequinGate2Board canon={parsed as unknown as MannequinGate2Canon} readonly />;
  }
  if (puzzleType === 34 && parsed.cells) {
    return <HashiBoard canon={parsed as unknown as HashiCanon} readonly />;
  }
  if (puzzleType === 35 && parsed.cells && parsed.words) {
    return <SkeletonPuzzleBoard canon={parsed as unknown as SkeletonPuzzleCanon} readonly />;
  }
  if (puzzleType === 36 && parsed.ropes && parsed.circles) {
    return <ZebraRopeBoard canon={parsed as unknown as ZebraRopeCanon} readonly />;
  }
  if (puzzleType === 37 && parsed.gray && parsed.circles) {
    return <WhimsicalKnightBoard canon={parsed as unknown as WhimsicalKnightCanon} readonly />;
  }
  if (puzzleType === 38 && parsed.numbers && parsed.arrows) {
    return <OminoTreeBoard canon={parsed as unknown as OminoTreeCanon} readonly />;
  }
  if (puzzleType === 39 && parsed.cells && parsed.edges && parsed.circles) {
    return <MinusRoomBoard canon={parsed as unknown as MinusRoomCanon} readonly />;
  }
  if (puzzleType === 40 && parsed.cells && parsed.grids) {
    return <TilePaintBoard canon={parsed as unknown as TilePaintCanon} readonly />;
  }
  if (puzzleType === 41 && parsed.cells && parsed.grids) {
    return <CountryRoadBoard canon={parsed as unknown as CountryRoadCanon} readonly />;
  }
  if (puzzleType === 44 && parsed.walls && parsed.entrance && parsed.exit) {
    return <PicturesqueMazeBoard canon={parsed as unknown as PicturesqueMazeCanon} readonly />;
  }
  if (puzzleType === 45 && parsed.cells && parsed.rowClues && parsed.colClues) {
    return <IrregularNonogramBoard canon={parsed as unknown as IrregularNonogramCanon} readonly />;
  }
  return <p style={{ color: "#666", fontSize: "0.85rem" }}>No preview available for this puzzle type.</p>;
}
