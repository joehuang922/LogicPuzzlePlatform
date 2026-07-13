import { useState, useEffect, useRef } from "react";
import { unzip } from "fflate";
import { parseImage, createPuzzle, PuzzleType, Collection } from "../api/client";
import { resizeImage, blobToDataUrl } from "../utils/image";
import { cardStyle, fieldStyle, inputStyle, errorStyle } from "../styles/admin";
import { DIFFICULTY_OPTIONS } from "../constants";
import CanonPreview from "./CanonPreview";
import NurimazeEditor from "./NurimazeEditor";
import SudokuEditor from "./SudokuEditor";
import ComboSudokuEditor from "./ComboSudokuEditor";
import DoubleChocoEditor from "./DoubleChocoEditor";
import SlitherlinkEditor from "./SlitherlinkEditor";

const MAX_IMAGES = 50;
const PARSE_CONCURRENCY = 3;
const PARSE_TIMEOUT_MS = 120_000;
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);

interface BatchItem {
  id: string;
  filename: string;
  thumbnailUrl: string;
  dataUrl: string;
  status: "pending" | "parsing" | "success" | "error";
  error?: string;
  canonRepr?: string;
  title: string;
  difficulty: number;
  checked: boolean;
  editorOpen: boolean;
}

function computeDimensions(typeId: number, canon: Record<string, unknown>): { w?: number; h?: number } {
  if (typeId === 1) return { w: 9, h: 9 };
  if (typeId === 2 && canon.subboards) {
    const subs = canon.subboards as { x: number; y: number }[];
    return {
      w: Math.max(...subs.map((b) => b.x)) + 9,
      h: Math.max(...subs.map((b) => b.y)) + 9,
    };
  }
  if ((typeId === 3 || typeId === 4 || typeId === 5) && canon.cells) {
    const cells = canon.cells as unknown[][];
    return { h: cells.length, w: (cells[0] as unknown[]).length };
  }
  if (typeId === 6 && canon.rowClues) {
    const rowClues = canon.rowClues as unknown[];
    const colClues = canon.colClues as unknown[];
    return { h: rowClues.length, w: colClues.length };
  }
  return {};
}

function InlineEditor({
  puzzleType,
  puzzleTypes,
  canonRepr,
  onComplete,
  onCancel,
}: {
  puzzleType: number;
  puzzleTypes: PuzzleType[];
  canonRepr: string;
  onComplete: (json: string) => void;
  onCancel: () => void;
}) {
  const typeName = puzzleTypes.find((pt) => pt.id === puzzleType)?.name;

  if (typeName === "nurimaze") {
    return <NurimazeEditor initialJson={canonRepr} onComplete={onComplete} onCancel={onCancel} />;
  }
  if (typeName === "sudoku") {
    return <SudokuEditor initialJson={canonRepr} onComplete={onComplete} onCancel={onCancel} />;
  }
  if (typeName === "combo-sudoku") {
    return <ComboSudokuEditor initialJson={canonRepr} onComplete={onComplete} onCancel={onCancel} />;
  }
  if (typeName === "double-choco") {
    return <DoubleChocoEditor initialJson={canonRepr} onComplete={onComplete} onCancel={onCancel} />;
  }
  if (typeName === "slitherlink") {
    return <SlitherlinkEditor initialCanon={canonRepr} onComplete={onComplete} onCancel={onCancel} />;
  }
  return null;
}

function BatchItemRow({
  item,
  puzzleType,
  puzzleTypes,
  onToggleCheck,
  onRemove,
  onRetry,
  onTitleChange,
  onDifficultyChange,
  onCanonChange,
  onToggleEditor,
}: {
  item: BatchItem;
  puzzleType: number;
  puzzleTypes: PuzzleType[];
  onToggleCheck: () => void;
  onRemove: () => void;
  onRetry: () => void;
  onTitleChange: (t: string) => void;
  onDifficultyChange: (d: number) => void;
  onCanonChange: (json: string) => void;
  onToggleEditor: () => void;
}) {
  const typeName = puzzleTypes.find((pt) => pt.id === puzzleType)?.name;
  const hasEditor = ["nurimaze", "sudoku", "combo-sudoku", "double-choco", "slitherlink"].includes(typeName || "");

  return (
    <div style={{ border: "1px solid #eee", borderRadius: 6, padding: "0.75rem", background: item.editorOpen ? "#fffbe6" : "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <input
          type="checkbox"
          checked={item.checked}
          onChange={onToggleCheck}
          disabled={item.status !== "success"}
        />
        <img
          src={item.thumbnailUrl}
          alt={item.filename}
          style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 4, border: "1px solid #ddd" }}
        />
        <span style={{ fontSize: "0.8rem", fontFamily: "monospace", minWidth: 120 }}>{item.filename}</span>

        {item.status === "pending" && (
          <span style={{ fontSize: "0.8rem", color: "#999" }}>Pending</span>
        )}
        {item.status === "parsing" && (
          <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <span style={{ display: "inline-block", width: 12, height: 12, border: "2px solid #333", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <span style={{ fontSize: "0.8rem" }}>Parsing...</span>
          </span>
        )}
        {item.status === "success" && (
          <span style={{ color: "green", fontSize: "0.85rem", fontWeight: "bold" }}>✓</span>
        )}
        {item.status === "error" && (
          <span style={{ color: "red", fontSize: "0.8rem", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.error}>
            ✗ {item.error}
          </span>
        )}

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {item.status === "success" && (
            <input
              style={{ ...inputStyle, fontSize: "0.75rem", padding: "0.2rem", width: 120 }}
              placeholder="Title"
              value={item.title}
              onChange={(e) => onTitleChange(e.target.value)}
            />
          )}
          {item.status === "success" && (
            <select
              style={{ ...inputStyle, fontSize: "0.75rem", padding: "0.2rem" }}
              value={item.difficulty}
              onChange={(e) => onDifficultyChange(Number(e.target.value))}
            >
              {DIFFICULTY_OPTIONS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          )}
          {item.status === "success" && hasEditor && (
            <button
              type="button"
              onClick={onToggleEditor}
              style={{ padding: "0.2rem 0.5rem", fontSize: "0.7rem", border: "1px solid #4a90d9", borderRadius: 3, background: item.editorOpen ? "#4a90d9" : "#f0f7ff", color: item.editorOpen ? "#fff" : "#4a90d9", cursor: "pointer" }}
            >
              Edit
            </button>
          )}
          {item.status === "error" && (
            <button
              type="button"
              onClick={onRetry}
              style={{ padding: "0.2rem 0.5rem", fontSize: "0.7rem", border: "1px solid #e8a020", borderRadius: 3, background: "#fffbe6", cursor: "pointer" }}
            >
              Retry
            </button>
          )}
          <button
            type="button"
            onClick={onRemove}
            style={{ padding: "0.2rem 0.5rem", fontSize: "0.7rem", border: "1px solid #ccc", borderRadius: 3, background: "#fff", cursor: "pointer", color: "#999" }}
          >
            ✗
          </button>
        </div>
      </div>

      {item.status === "success" && !item.editorOpen && item.canonRepr && (
        <div style={{ marginTop: "0.5rem", marginLeft: 80 }}>
          <CanonPreview puzzleType={puzzleType} canonRepr={item.canonRepr} />
        </div>
      )}

      {item.editorOpen && item.canonRepr && (
        <div style={{ marginTop: "0.75rem", borderTop: "1px solid #e8c840", paddingTop: "0.75rem" }}>
          <InlineEditor
            puzzleType={puzzleType}
            puzzleTypes={puzzleTypes}
            canonRepr={item.canonRepr}
            onComplete={(json) => { onCanonChange(json); onToggleEditor(); }}
            onCancel={onToggleEditor}
          />
        </div>
      )}
    </div>
  );
}

export default function BatchUploadForm({
  puzzleTypes,
  collections,
}: {
  puzzleTypes: PuzzleType[];
  collections: Collection[];
}) {
  const [puzzleType, setPuzzleType] = useState("");
  const [defaultDifficulty, setDefaultDifficulty] = useState("3");
  const [author, setAuthor] = useState("");
  const [srcCollection, setSrcCollection] = useState("");
  const [items, setItems] = useState<BatchItem[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createProgress, setCreateProgress] = useState({ done: 0, total: 0 });
  const [createResult, setCreateResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const successCount = items.filter((i) => i.status === "success").length;
  const errorCount = items.filter((i) => i.status === "error").length;
  const parsingCount = items.filter((i) => i.status === "parsing").length;
  const checkedCount = items.filter((i) => i.checked).length;

  function updateItem(id: string, patch: Partial<BatchItem>) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  async function handleZipUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!puzzleType) {
      setExtractError("Select a puzzle type before uploading.");
      return;
    }

    setExtractError(null);
    setExtracting(true);
    setCreateResult(null);

    try {
      const buffer = await file.arrayBuffer();
      const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
        unzip(new Uint8Array(buffer), (err, result) => {
          if (err) reject(new Error("Failed to extract zip: " + err.message));
          else resolve(result);
        });
      });

      const imageEntries = Object.entries(files).filter(([name]) => {
        if (name.startsWith("__MACOSX/") || name.startsWith(".")) return false;
        const ext = name.split(".").pop()?.toLowerCase() || "";
        return IMAGE_EXTENSIONS.has(ext);
      });

      if (imageEntries.length === 0) {
        setExtractError("No image files found in the zip.");
        setExtracting(false);
        return;
      }

      let truncated = false;
      let entries = imageEntries;
      if (entries.length > MAX_IMAGES) {
        entries = entries.slice(0, MAX_IMAGES);
        truncated = true;
      }

      // Revoke old URLs
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current = [];

      const newItems: BatchItem[] = entries.map(([name, data], idx) => {
        const blob = new Blob([data]);
        const url = URL.createObjectURL(blob);
        objectUrlsRef.current.push(url);
        const filename = name.split("/").pop() || name;
        return {
          id: `${idx}-${filename}`,
          filename,
          thumbnailUrl: url,
          dataUrl: "",
          status: "pending" as const,
          title: "",
          difficulty: Number(defaultDifficulty),
          checked: true,
          editorOpen: false,
        };
      });

      setItems(newItems);
      setExtracting(false);

      if (truncated) {
        setExtractError(`Zip contained more than ${MAX_IMAGES} images. Only the first ${MAX_IMAGES} were loaded.`);
      }

      // Start parsing
      parseAll(newItems, entries);
    } catch (err: unknown) {
      setExtractError(err instanceof Error ? err.message : "Failed to extract zip");
      setExtracting(false);
    }
  }

  async function parseAll(itemList: BatchItem[], entries: [string, Uint8Array][]) {
    const queue = [...itemList.map((item, idx) => ({ item, data: entries[idx][1] }))];
    let active = 0;
    let queueIdx = 0;

    function processNext(): Promise<void> {
      if (queueIdx >= queue.length) return Promise.resolve();
      const current = queue[queueIdx];
      queueIdx++;
      active++;

      return parseSingleItem(current.item.id, current.data).finally(() => {
        active--;
        return processNext();
      });
    }

    const workers = Array.from({ length: Math.min(PARSE_CONCURRENCY, queue.length) }, () => processNext());
    await Promise.all(workers);
  }

  async function parseSingleItem(itemId: string, data: Uint8Array) {
    updateItem(itemId, { status: "parsing" });

    try {
      const blob = new Blob([data]);
      const dataUrl = await blobToDataUrl(blob);
      const base64 = await resizeImage(dataUrl);

      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timed out (2min)")), PARSE_TIMEOUT_MS)
      );

      const res = await Promise.race([
        parseImage(base64, Number(puzzleType)),
        timeout,
      ]);

      updateItem(itemId, {
        status: "success",
        canonRepr: JSON.stringify(res.canon, null, 2),
        dataUrl,
        error: undefined,
      });
    } catch (err: unknown) {
      updateItem(itemId, {
        status: "error",
        error: err instanceof Error ? err.message : "Parse failed",
      });
    }
  }

  async function handleRetry(itemId: string) {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;

    // Re-read the blob from the thumbnail URL
    updateItem(itemId, { status: "parsing", error: undefined });

    try {
      const response = await fetch(item.thumbnailUrl);
      const blob = await response.blob();
      const data = new Uint8Array(await blob.arrayBuffer());
      await parseSingleItem(itemId, data);
    } catch (err: unknown) {
      updateItem(itemId, {
        status: "error",
        error: err instanceof Error ? err.message : "Retry failed",
      });
    }
  }

  async function handleCreateAll() {
    const toCreate = items.filter((i) => i.checked && i.status === "success" && i.canonRepr);
    if (toCreate.length === 0) return;

    setCreating(true);
    setCreateProgress({ done: 0, total: toCreate.length });
    setCreateResult(null);

    let created = 0;
    let failed = 0;

    for (const item of toCreate) {
      try {
        const canon = JSON.parse(item.canonRepr!);
        const typeId = Number(puzzleType);
        const { w, h } = computeDimensions(typeId, canon);

        await createPuzzle({
          puzzleType: typeId,
          difficulty: item.difficulty,
          canonRepr: canon,
          title: item.title.trim() || undefined,
          author: author.trim() || undefined,
          width: w,
          height: h,
          ...(srcCollection ? { srcCollection: Number(srcCollection) } : {}),
        });
        created++;
      } catch {
        failed++;
      }
      setCreateProgress({ done: created + failed, total: toCreate.length });
    }

    setCreating(false);
    setCreateResult(
      failed === 0
        ? `Successfully created ${created} puzzle(s).`
        : `Created ${created}, failed ${failed} out of ${toCreate.length}.`
    );
  }

  function handleSelectAll() {
    setItems((prev) => prev.map((item) => item.status === "success" ? { ...item, checked: true } : item));
  }

  function handleDeselectAll() {
    setItems((prev) => prev.map((item) => ({ ...item, checked: false })));
  }

  function handlePuzzleTypeChange(newType: string) {
    if (items.length > 0 && newType !== puzzleType) {
      if (!window.confirm("Changing puzzle type will clear all current items. Continue?")) return;
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current = [];
      setItems([]);
    }
    setPuzzleType(newType);
  }

  return (
    <div style={cardStyle}>
      <h2>Batch Upload</h2>

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <div style={fieldStyle}>
          <label style={{ fontSize: "0.8rem", fontWeight: "bold" }}>Puzzle type *</label>
          <select style={inputStyle} value={puzzleType} onChange={(e) => handlePuzzleTypeChange(e.target.value)}>
            <option value="">— Select —</option>
            {puzzleTypes.map((pt) => (
              <option key={pt.id} value={pt.id}>{pt.name}</option>
            ))}
          </select>
        </div>
        <div style={fieldStyle}>
          <label style={{ fontSize: "0.8rem", fontWeight: "bold" }}>Default difficulty</label>
          <select style={inputStyle} value={defaultDifficulty} onChange={(e) => setDefaultDifficulty(e.target.value)}>
            {DIFFICULTY_OPTIONS.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>
        <div style={fieldStyle}>
          <label style={{ fontSize: "0.8rem", fontWeight: "bold" }}>Author</label>
          <input style={inputStyle} placeholder="Author" value={author} onChange={(e) => setAuthor(e.target.value)} />
        </div>
        <div style={fieldStyle}>
          <label style={{ fontSize: "0.8rem", fontWeight: "bold" }}>Source collection</label>
          <select style={inputStyle} value={srcCollection} onChange={(e) => setSrcCollection(e.target.value)}>
            <option value="">— None —</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ border: "1px dashed #aaa", borderRadius: 8, padding: "1rem", background: "#fafafa", marginBottom: "1rem" }}>
        <label style={{ fontWeight: "bold", marginBottom: "0.5rem", display: "block" }}>
          Upload ZIP file
        </label>
        <p style={{ fontSize: "0.8rem", color: "#666", margin: "0 0 0.5rem" }}>
          Upload a .zip containing up to {MAX_IMAGES} puzzle images. Select puzzle type first.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          onChange={handleZipUpload}
          disabled={extracting || !puzzleType || parsingCount > 0}
        />
        {extracting && (
          <div style={{ marginTop: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid #333", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <span style={{ fontSize: "0.85rem" }}>Extracting zip...</span>
          </div>
        )}
        {extractError && <p style={{ ...errorStyle, marginTop: "0.5rem" }}>{extractError}</p>}
      </div>

      {items.length > 0 && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", padding: "0.5rem 0.75rem", background: "#f0f7ff", borderRadius: 6 }}>
            <div style={{ display: "flex", gap: "1rem", fontSize: "0.85rem" }}>
              <span>{items.length} image(s)</span>
              {successCount > 0 && <span style={{ color: "green" }}>✓ {successCount} parsed</span>}
              {parsingCount > 0 && <span style={{ color: "#666" }}>⟳ {parsingCount} parsing</span>}
              {errorCount > 0 && <span style={{ color: "red" }}>✗ {errorCount} failed</span>}
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                onClick={handleSelectAll}
                style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem", border: "1px solid #ccc", borderRadius: 3, cursor: "pointer" }}
              >
                Select All
              </button>
              <button
                type="button"
                onClick={handleDeselectAll}
                style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem", border: "1px solid #ccc", borderRadius: 3, cursor: "pointer" }}
              >
                Deselect All
              </button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: 600, overflowY: "auto", marginBottom: "1rem" }}>
            {items.map((item) => (
              <BatchItemRow
                key={item.id}
                item={item}
                puzzleType={Number(puzzleType)}
                puzzleTypes={puzzleTypes}
                onToggleCheck={() => updateItem(item.id, { checked: !item.checked })}
                onRemove={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
                onRetry={() => handleRetry(item.id)}
                onTitleChange={(t) => updateItem(item.id, { title: t })}
                onDifficultyChange={(d) => updateItem(item.id, { difficulty: d })}
                onCanonChange={(json) => updateItem(item.id, { canonRepr: json })}
                onToggleEditor={() => updateItem(item.id, { editorOpen: !item.editorOpen })}
              />
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <button
              type="button"
              onClick={handleCreateAll}
              disabled={creating || checkedCount === 0 || parsingCount > 0}
              style={{ padding: "0.5rem 1.25rem", fontSize: "0.9rem", background: checkedCount > 0 ? "#4a90d9" : "#ccc", color: "#fff", border: "none", borderRadius: 4, cursor: checkedCount > 0 ? "pointer" : "default" }}
            >
              {creating
                ? `Creating... (${createProgress.done}/${createProgress.total})`
                : `Create Selected (${checkedCount})`}
            </button>
            {createResult && (
              <span style={{ fontSize: "0.85rem", color: createResult.includes("failed") ? "red" : "green" }}>
                {createResult}
              </span>
            )}
          </div>
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
