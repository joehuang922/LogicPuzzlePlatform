import { useEffect, useState, useRef, FormEvent } from "react";
import {
  listPuzzleTypes,
  listCollections,
  listPuzzles,
  createCollection,
  createPuzzle,
  updatePuzzle,
  deletePuzzle,
  parseImage,
  PuzzleType,
  Collection,
  Puzzle,
} from "../api/client";
import SudokuBoard from "../components/SudokuBoard";
import ComboSudokuBoard from "../components/ComboSudokuBoard";
import NurimazeBoard from "../components/NurimazeBoard";
import DoubleChocoBoard from "../components/DoubleChocoBoard";
import NurimazeEditor from "../components/NurimazeEditor";
import SudokuEditor from "../components/SudokuEditor";
import ComboSudokuEditor from "../components/ComboSudokuEditor";
import DoubleChocoEditor from "../components/DoubleChocoEditor";
import SlitherlinkBoard from "../components/SlitherlinkBoard";
import SlitherlinkEditor from "../components/SlitherlinkEditor";
import { NurimazeCanon, DoubleChocoCanon, SlitherlinkCanon } from "../types/canon";
import { DIFFICULTY_OPTIONS, DIFFICULTY_LABELS } from "../constants";

const fieldStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
};

const inputStyle: React.CSSProperties = {
  padding: "0.4rem",
  fontSize: "0.9rem",
  border: "1px solid #ccc",
  borderRadius: 4,
};

const errorStyle: React.CSSProperties = {
  color: "red",
  fontSize: "0.8rem",
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 8,
  padding: "1.5rem",
  marginBottom: "2rem",
};

function CollectionForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [publisher, setPublisher] = useState("");
  const [publishAt, setPublishAt] = useState("");
  const [coverSrc, setCoverSrc] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Name is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSuccess(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      const res = await createCollection({
        name: name.trim(),
        publisher: publisher.trim() || undefined,
        publishAt: publishAt || undefined,
        coverSrc: coverSrc.trim() || undefined,
      });
      setSuccess(`Collection created (id: ${res.id})`);
      setName("");
      setPublisher("");
      setPublishAt("");
      setCoverSrc("");
      setErrors({});
      onCreated();
    } catch (err: unknown) {
      setErrors({ form: err instanceof Error ? err.message : "Failed to create" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={cardStyle}>
      <h2>New Collection</h2>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <div style={fieldStyle}>
          <label>Name *</label>
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
          {errors.name && <span style={errorStyle}>{errors.name}</span>}
        </div>
        <div style={fieldStyle}>
          <label>Publisher</label>
          <input style={inputStyle} value={publisher} onChange={(e) => setPublisher(e.target.value)} />
        </div>
        <div style={fieldStyle}>
          <label>Publish date</label>
          <input style={inputStyle} type="date" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} />
        </div>
        <div style={fieldStyle}>
          <label>Cover image URL</label>
          <input style={inputStyle} value={coverSrc} onChange={(e) => setCoverSrc(e.target.value)} />
        </div>
        {errors.form && <span style={errorStyle}>{errors.form}</span>}
        {success && <span style={{ color: "green", fontSize: "0.85rem" }}>{success}</span>}
        <button type="submit" disabled={submitting} style={{ alignSelf: "flex-start", padding: "0.5rem 1rem" }}>
          {submitting ? "Creating..." : "Create Collection"}
        </button>
      </form>
    </div>
  );
}

const PARSE_TIMEOUT_MS = 120_000;
const MAX_IMAGE_DIMENSION = 2048;

function resizeImage(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width <= MAX_IMAGE_DIMENSION && height <= MAX_IMAGE_DIMENSION) {
        resolve(dataUrl.split(",")[1]);
        return;
      }
      const scale = MAX_IMAGE_DIMENSION / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      const resized = canvas.toDataURL("image/jpeg", 0.85);
      resolve(resized.split(",")[1]);
    };
    img.src = dataUrl;
  });
}

function CanonPreview({ puzzleType, canonRepr }: { puzzleType: number; canonRepr: string }) {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(canonRepr);
  } catch {
    return null;
  }

  if (puzzleType === 1 && parsed.hints) {
    return <SudokuBoard hints={parsed.hints as number[][]} />;
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
  return <p style={{ color: "#666", fontSize: "0.85rem" }}>No preview available for this puzzle type.</p>;
}

function QuestionForm({
  puzzleTypes,
  collections,
}: {
  puzzleTypes: PuzzleType[];
  collections: Collection[];
}) {
  const [puzzleType, setPuzzleType] = useState("");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [canonRepr, setCanonRepr] = useState("");
  const [srcCollection, setSrcCollection] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const selectedTypeName = puzzleTypes.find((pt) => String(pt.id) === puzzleType)?.name;
  const isNurimaze = selectedTypeName === "nurimaze";
  const isSudoku = selectedTypeName === "sudoku";
  const isComboSudoku = selectedTypeName === "combo-sudoku";
  const isDoubleChoco = selectedTypeName === "double-choco";
  const isSlitherlink = selectedTypeName === "slitherlink";
  const hasEditor = isNurimaze || isSudoku || isComboSudoku || isDoubleChoco || isSlitherlink;

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!puzzleType) errs.puzzleType = "Puzzle type is required";
    if (!difficulty) errs.difficulty = "Difficulty is required";
    if (!canonRepr.trim()) {
      errs.canonRepr = "Canon repr is required";
    } else {
      try {
        JSON.parse(canonRepr);
      } catch {
        errs.canonRepr = "Must be valid JSON";
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSuccess(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      const canon = JSON.parse(canonRepr);
      const typeId = Number(puzzleType);
      let w: number | undefined;
      let h: number | undefined;
      if (typeId === 1) {
        w = 9;
        h = 9;
      } else if (typeId === 2 && canon.subboards) {
        w = Math.max(...canon.subboards.map((b: { x: number }) => b.x)) + 9;
        h = Math.max(...canon.subboards.map((b: { y: number }) => b.y)) + 9;
      } else if (typeId === 3 && canon.cells) {
        h = canon.cells.length;
        w = canon.cells[0].length;
      } else if (typeId === 4 && canon.cells) {
        h = canon.cells.length;
        w = canon.cells[0].length;
      } else if (typeId === 5 && canon.cells) {
        h = canon.cells.length;
        w = canon.cells[0].length;
      }
      const res = await createPuzzle({
        puzzleType: typeId,
        difficulty: Number(difficulty),
        canonRepr: canon,
        title: title.trim() || undefined,
        author: author.trim() || undefined,
        width: w,
        height: h,
        ...(srcCollection ? { srcCollection: Number(srcCollection) } : {}),
      });
      setSuccess(`Puzzle created (id: ${res.id})`);
      setTitle("");
      setAuthor("");
      setCanonRepr("");
      setImagePreview(null);
      setErrors({});
    } catch (err: unknown) {
      setErrors({ form: err instanceof Error ? err.message : "Failed to create" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!puzzleType) {
      setParseError("Select a puzzle type before uploading an image.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setImagePreview(dataUrl);
      setParseError(null);
      setParsing(true);

      try {
        const base64 = await resizeImage(dataUrl);

        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Parsing timed out (2min). Cold start may take a while — try again.")), PARSE_TIMEOUT_MS)
        );

        const res = await Promise.race([
          parseImage(base64, Number(puzzleType)),
          timeout,
        ]);
        setCanonRepr(JSON.stringify(res.canon, null, 2));
        setParseError(null);
      } catch (err: unknown) {
        setParseError(err instanceof Error ? err.message : "Parse failed");
      } finally {
        setParsing(false);
      }
    };
    reader.readAsDataURL(file);
  }

  const showPreview = canonRepr.trim() && puzzleType;

  return (
    <div style={cardStyle}>
      <h2>New Question</h2>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <div style={fieldStyle}>
          <label>Puzzle type *</label>
          <select style={inputStyle} value={puzzleType} onChange={(e) => setPuzzleType(e.target.value)}>
            <option value="">— Select —</option>
            {puzzleTypes.map((pt) => (
              <option key={pt.id} value={pt.id}>{pt.name}</option>
            ))}
          </select>
          {errors.puzzleType && <span style={errorStyle}>{errors.puzzleType}</span>}
        </div>
        <div style={fieldStyle}>
          <label>Difficulty *</label>
          <select style={inputStyle} value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
            <option value="">— Select —</option>
            {DIFFICULTY_OPTIONS.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
          {errors.difficulty && <span style={errorStyle}>{errors.difficulty}</span>}
        </div>
        <div style={fieldStyle}>
          <label>Title</label>
          <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div style={fieldStyle}>
          <label>Author</label>
          <input style={inputStyle} value={author} onChange={(e) => setAuthor(e.target.value)} />
        </div>
        <div style={fieldStyle}>
          <label>Source collection</label>
          <select style={inputStyle} value={srcCollection} onChange={(e) => setSrcCollection(e.target.value)}>
            <option value="">— None —</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div style={{ border: "1px dashed #aaa", borderRadius: 8, padding: "1rem", background: "#fafafa" }}>
          <label style={{ fontWeight: "bold", marginBottom: "0.5rem", display: "block" }}>
            Parse from image (optional)
          </label>
          <p style={{ fontSize: "0.8rem", color: "#666", margin: "0 0 0.5rem" }}>
            Upload a puzzle image to auto-extract the canon JSON. Select puzzle type first.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            disabled={parsing}
          />
          {parsing && (
            <div style={{ marginTop: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ display: "inline-block", width: 16, height: 16, border: "2px solid #333", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              <span style={{ fontSize: "0.85rem" }}>Parsing image (first call may take ~30s for cold start)...</span>
            </div>
          )}
          {parseError && <p style={{ ...errorStyle, marginTop: "0.5rem" }}>{parseError}</p>}
          {imagePreview && (
            <div style={{ marginTop: "0.5rem" }}>
              <img src={imagePreview} alt="Uploaded puzzle" style={{ maxWidth: 300, maxHeight: 300, border: "1px solid #ddd", borderRadius: 4 }} />
            </div>
          )}
        </div>

        <div style={fieldStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <label>Canon repr (JSON) *</label>
            {hasEditor && !editorOpen && (
              <button
                type="button"
                onClick={() => setEditorOpen(true)}
                style={{ padding: "0.25rem 0.75rem", fontSize: "0.8rem", border: "1px solid #4a90d9", borderRadius: 4, background: "#f0f7ff", color: "#4a90d9", cursor: "pointer" }}
              >
                Open Board Editor
              </button>
            )}
            {puzzleType && !hasEditor && (
              <span style={{ fontSize: "0.75rem", color: "#999", fontStyle: "italic" }}>
                No visual editor supported for this puzzle type yet.
              </span>
            )}
          </div>
          {editorOpen && hasEditor ? (
            isNurimaze ? (
              <NurimazeEditor
                initialJson={canonRepr}
                onComplete={(json) => { setCanonRepr(json); setEditorOpen(false); }}
                onCancel={() => setEditorOpen(false)}
              />
            ) : isSudoku ? (
              <SudokuEditor
                initialJson={canonRepr}
                onComplete={(json) => { setCanonRepr(json); setEditorOpen(false); }}
                onCancel={() => setEditorOpen(false)}
              />
            ) : isDoubleChoco ? (
              <DoubleChocoEditor
                initialJson={canonRepr}
                onComplete={(json) => { setCanonRepr(json); setEditorOpen(false); }}
                onCancel={() => setEditorOpen(false)}
              />
            ) : isSlitherlink ? (
              <SlitherlinkEditor
                initialCanon={canonRepr}
                onComplete={(json) => { setCanonRepr(json); setEditorOpen(false); }}
                onCancel={() => setEditorOpen(false)}
              />
            ) : (
              <ComboSudokuEditor
                initialJson={canonRepr}
                onComplete={(json) => { setCanonRepr(json); setEditorOpen(false); }}
                onCancel={() => setEditorOpen(false)}
              />
            )
          ) : (
            <textarea
              style={{ ...inputStyle, minHeight: 120, fontFamily: "monospace", fontSize: "0.8rem" }}
              value={canonRepr}
              onChange={(e) => setCanonRepr(e.target.value)}
            />
          )}
          {errors.canonRepr && <span style={errorStyle}>{errors.canonRepr}</span>}
        </div>

        {showPreview && (
          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: "1rem" }}>
            <label style={{ fontWeight: "bold", marginBottom: "0.5rem", display: "block" }}>Preview</label>
            <CanonPreview puzzleType={Number(puzzleType)} canonRepr={canonRepr} />
          </div>
        )}

        {errors.form && <span style={errorStyle}>{errors.form}</span>}
        {success && <span style={{ color: "green", fontSize: "0.85rem" }}>{success}</span>}
        <button type="submit" disabled={submitting || parsing} style={{ alignSelf: "flex-start", padding: "0.5rem 1rem" }}>
          {submitting ? "Creating..." : "Create Question"}
        </button>
      </form>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function PuzzleEditRow({
  puzzle,
  puzzleTypes,
  onSaved,
  onCancel,
}: {
  puzzle: Puzzle;
  puzzleTypes: PuzzleType[];
  onSaved: (updated: Puzzle) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(puzzle.title || "");
  const [author, setAuthor] = useState(puzzle.author || "");
  const [difficulty, setDifficulty] = useState(String(puzzle.difficulty));
  const [canonRepr, setCanonRepr] = useState(
    typeof puzzle.canonRepr === "string" ? puzzle.canonRepr : JSON.stringify(puzzle.canonRepr, null, 2)
  );
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typeName = puzzleTypes.find((pt) => pt.id === puzzle.puzzleType)?.name;
  const isNurimaze = typeName === "nurimaze";
  const isSudoku = typeName === "sudoku";
  const isComboSudoku = typeName === "combo-sudoku";
  const isDoubleChoco = typeName === "double-choco";
  const isSlitherlink = typeName === "slitherlink";
  const hasEditor = isNurimaze || isSudoku || isComboSudoku || isDoubleChoco || isSlitherlink;

  async function handleConfirm() {
    let parsedCanon: Record<string, unknown>;
    try {
      parsedCanon = JSON.parse(canonRepr);
    } catch {
      setError("Canon repr must be valid JSON");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await updatePuzzle(puzzle.id, {
        title: title.trim() || null,
        author: author.trim() || null,
        difficulty: Number(difficulty),
        canonRepr: parsedCanon,
      });
      onSaved(res.puzzle as unknown as Puzzle);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr>
      <td colSpan={6} style={{ padding: "0.75rem", background: "#fffbe6", borderBottom: "2px solid #e8c840" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            <div style={fieldStyle}>
              <label style={{ fontSize: "0.75rem", fontWeight: "bold" }}>Title</label>
              <input style={{ ...inputStyle, width: 200 }} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div style={fieldStyle}>
              <label style={{ fontSize: "0.75rem", fontWeight: "bold" }}>Difficulty</label>
              <select style={{ ...inputStyle, width: 140 }} value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                {DIFFICULTY_OPTIONS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
            <div style={fieldStyle}>
              <label style={{ fontSize: "0.75rem", fontWeight: "bold" }}>Author</label>
              <input style={{ ...inputStyle, width: 160 }} value={author} onChange={(e) => setAuthor(e.target.value)} />
            </div>
          </div>
          <div style={fieldStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: "bold" }}>Canon repr (JSON)</label>
              {hasEditor && !editorOpen && (
                <button
                  type="button"
                  onClick={() => setEditorOpen(true)}
                  style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem", border: "1px solid #4a90d9", borderRadius: 4, background: "#f0f7ff", color: "#4a90d9", cursor: "pointer" }}
                >
                  Open Board Editor
                </button>
              )}
            </div>
            {editorOpen && hasEditor ? (
              isNurimaze ? (
                <NurimazeEditor
                  initialJson={canonRepr}
                  onComplete={(json) => { setCanonRepr(json); setEditorOpen(false); }}
                  onCancel={() => setEditorOpen(false)}
                />
              ) : isSudoku ? (
                <SudokuEditor
                  initialJson={canonRepr}
                  onComplete={(json) => { setCanonRepr(json); setEditorOpen(false); }}
                  onCancel={() => setEditorOpen(false)}
                />
              ) : isDoubleChoco ? (
                <DoubleChocoEditor
                  initialJson={canonRepr}
                  onComplete={(json) => { setCanonRepr(json); setEditorOpen(false); }}
                  onCancel={() => setEditorOpen(false)}
                />
              ) : isSlitherlink ? (
                <SlitherlinkEditor
                  initialCanon={canonRepr}
                  onComplete={(json) => { setCanonRepr(json); setEditorOpen(false); }}
                  onCancel={() => setEditorOpen(false)}
                />
              ) : (
                <ComboSudokuEditor
                  initialJson={canonRepr}
                  onComplete={(json) => { setCanonRepr(json); setEditorOpen(false); }}
                  onCancel={() => setEditorOpen(false)}
                />
              )
            ) : (
              <textarea
                style={{ ...inputStyle, minHeight: 100, fontFamily: "monospace", fontSize: "0.75rem" }}
                value={canonRepr}
                onChange={(e) => setCanonRepr(e.target.value)}
              />
            )}
          </div>
          {canonRepr.trim() && (
            <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: "0.75rem", background: "#fff" }}>
              <label style={{ fontWeight: "bold", fontSize: "0.75rem", marginBottom: "0.25rem", display: "block" }}>Preview</label>
              <CanonPreview puzzleType={puzzle.puzzleType} canonRepr={canonRepr} />
            </div>
          )}
          {error && <span style={errorStyle}>{error}</span>}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              onClick={handleConfirm}
              disabled={saving}
              style={{ padding: "0.3rem 0.75rem", fontSize: "0.8rem", background: "#4a90d9", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}
            >
              {saving ? "Saving..." : "Confirm"}
            </button>
            <button
              onClick={onCancel}
              disabled={saving}
              style={{ padding: "0.3rem 0.75rem", fontSize: "0.8rem", border: "1px solid #ccc", borderRadius: 4, background: "#fff", cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}

function CollectionBrowser({
  collections,
  puzzleTypes,
  onDataChanged,
}: {
  collections: Collection[];
  puzzleTypes: PuzzleType[];
  onDataChanged: () => void;
}) {
  const sorted = [...collections].sort((a, b) => {
    if (!a.publishAt && !b.publishAt) return 0;
    if (!a.publishAt) return 1;
    if (!b.publishAt) return -1;
    return b.publishAt.localeCompare(a.publishAt);
  });

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [puzzles, setPuzzles] = useState<Puzzle[]>([]);
  const [loadingPuzzles, setLoadingPuzzles] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const puzzleTypeMap = Object.fromEntries(puzzleTypes.map((pt) => [pt.id, pt.name]));

  async function handleExpand(collectionId: number) {
    if (expandedId === collectionId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(collectionId);
    setChecked(new Set());
    setEditingId(null);
    setLoadingPuzzles(true);
    try {
      const res = await listPuzzles({ srcCollection: collectionId });
      setPuzzles(res.puzzles);
    } finally {
      setLoadingPuzzles(false);
    }
  }

  function toggleCheck(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDelete() {
    if (checked.size === 0) return;
    const confirmed = window.confirm(`Delete ${checked.size} selected question(s)? This cannot be undone.`);
    if (!confirmed) return;

    setDeleting(true);
    try {
      await Promise.all([...checked].map((id) => deletePuzzle(id)));
      setPuzzles((prev) => prev.filter((p) => !checked.has(p.id)));
      setChecked(new Set());
      onDataChanged();
    } finally {
      setDeleting(false);
    }
  }

  function handleSaved(updated: Puzzle) {
    setPuzzles((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setEditingId(null);
  }

  const groupedByType = puzzles.reduce<Record<number, Puzzle[]>>((acc, p) => {
    (acc[p.puzzleType] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div style={cardStyle}>
      <h2>Collections</h2>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #ddd", textAlign: "left" }}>
            <th style={{ padding: "0.5rem" }}>Name</th>
            <th style={{ padding: "0.5rem" }}>Publisher</th>
            <th style={{ padding: "0.5rem" }}>Publish Date</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => (
            <>
              <tr
                key={c.id}
                onClick={() => handleExpand(c.id)}
                style={{ cursor: "pointer", borderBottom: "1px solid #eee", background: expandedId === c.id ? "#f0f7ff" : undefined }}
              >
                <td style={{ padding: "0.5rem" }}>{c.name}</td>
                <td style={{ padding: "0.5rem" }}>{c.publisher || "—"}</td>
                <td style={{ padding: "0.5rem" }}>{c.publishAt || "—"}</td>
              </tr>
              {expandedId === c.id && (
                <tr key={`${c.id}-detail`}>
                  <td colSpan={3} style={{ padding: "0.75rem 0.5rem", background: "#fafafa" }}>
                    {loadingPuzzles ? (
                      <p style={{ margin: 0, fontSize: "0.85rem" }}>Loading questions...</p>
                    ) : puzzles.length === 0 ? (
                      <p style={{ margin: 0, fontSize: "0.85rem", color: "#666" }}>No questions in this collection.</p>
                    ) : (
                      <div>
                        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.5rem" }}>
                          <button
                            onClick={handleDelete}
                            disabled={checked.size === 0 || deleting}
                            style={{ padding: "0.3rem 0.75rem", fontSize: "0.8rem", color: checked.size > 0 ? "#fff" : undefined, background: checked.size > 0 ? "#d33" : undefined, border: "1px solid #ccc", borderRadius: 4, cursor: checked.size > 0 ? "pointer" : "default" }}
                          >
                            {deleting ? "Deleting..." : `Delete (${checked.size})`}
                          </button>
                        </div>
                        {Object.entries(groupedByType).map(([typeId, items]) => (
                          <div key={typeId} style={{ marginBottom: "0.75rem" }}>
                            <div style={{ fontWeight: "bold", fontSize: "0.85rem", padding: "0.3rem 0.5rem", background: "#e8e8e8", borderRadius: 4, marginBottom: "0.25rem" }}>
                              {puzzleTypeMap[Number(typeId)] || `Type ${typeId}`} ({items.length})
                            </div>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                              <thead>
                                <tr style={{ borderBottom: "1px solid #ddd", textAlign: "left" }}>
                                  <th style={{ padding: "0.3rem", width: 30 }}></th>
                                  <th style={{ padding: "0.3rem" }}>Title</th>
                                  <th style={{ padding: "0.3rem" }}>Difficulty</th>
                                  <th style={{ padding: "0.3rem" }}>Author</th>
                                  <th style={{ padding: "0.3rem" }}>Size</th>
                                  <th style={{ padding: "0.3rem", width: 50 }}></th>
                                </tr>
                              </thead>
                              <tbody>
                                {items.map((p) => (
                                  <>
                                    <tr key={p.id} style={{ borderBottom: editingId === p.id ? "none" : "1px solid #f0f0f0" }}>
                                      <td style={{ padding: "0.3rem", textAlign: "center" }}>
                                        <input
                                          type="checkbox"
                                          checked={checked.has(p.id)}
                                          onChange={() => toggleCheck(p.id)}
                                        />
                                      </td>
                                      <td style={{ padding: "0.3rem" }}>{p.title || "(none)"}</td>
                                      <td style={{ padding: "0.3rem" }}>{DIFFICULTY_LABELS[p.difficulty] || String(p.difficulty)}</td>
                                      <td style={{ padding: "0.3rem" }}>{p.author || "N/A"}</td>
                                      <td style={{ padding: "0.3rem" }}>{p.width && p.height ? `${p.width} x ${p.height}` : "—"}</td>
                                      <td style={{ padding: "0.3rem", textAlign: "center" }}>
                                        <button
                                          onClick={() => setEditingId(editingId === p.id ? null : p.id)}
                                          style={{ padding: "0.15rem 0.4rem", fontSize: "0.75rem", border: "1px solid #4a90d9", borderRadius: 3, background: editingId === p.id ? "#4a90d9" : "#f0f7ff", color: editingId === p.id ? "#fff" : "#4a90d9", cursor: "pointer" }}
                                        >
                                          Edit
                                        </button>
                                      </td>
                                    </tr>
                                    {editingId === p.id && (
                                      <PuzzleEditRow
                                        key={`${p.id}-edit`}
                                        puzzle={p}
                                        puzzleTypes={puzzleTypes}
                                        onSaved={handleSaved}
                                        onCancel={() => setEditingId(null)}
                                      />
                                    )}
                                  </>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Admin() {
  const [puzzleTypes, setPuzzleTypes] = useState<PuzzleType[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);

  function loadData() {
    Promise.all([listPuzzleTypes(), listCollections()])
      .then(([ptRes, cRes]) => {
        setPuzzleTypes(ptRes.puzzleTypes);
        setCollections(cRes.collections);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadData(); }, []);

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <h1>Admin</h1>
      <CollectionBrowser collections={collections} puzzleTypes={puzzleTypes} onDataChanged={loadData} />
      <CollectionForm onCreated={loadData} />
      <QuestionForm puzzleTypes={puzzleTypes} collections={collections} />
    </div>
  );
}
