import { useEffect, useState, useRef, FormEvent } from "react";
import {
  listPuzzleTypes,
  listCollections,
  createCollection,
  createPuzzle,
  parseImage,
  PuzzleType,
  Collection,
} from "../api/client";
import SudokuBoard from "../components/SudokuBoard";
import ComboSudokuBoard from "../components/ComboSudokuBoard";

const DIFFICULTY_OPTIONS = [
  { value: 1, label: "Very easy" },
  { value: 2, label: "Easy" },
  { value: 3, label: "Normal" },
  { value: 4, label: "Hard" },
  { value: 5, label: "Super hard" },
];

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

const PARSE_TIMEOUT_MS = 60_000;
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
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [canonRepr, setCanonRepr] = useState("");
  const [srcCollection, setSrcCollection] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      const res = await createPuzzle({
        puzzleType: Number(puzzleType),
        difficulty: Number(difficulty),
        canonRepr: JSON.parse(canonRepr),
        title: title.trim() || undefined,
        author: author.trim() || undefined,
        width: width ? Number(width) : undefined,
        height: height ? Number(height) : undefined,
        ...(srcCollection ? { srcCollection: Number(srcCollection) } : {}),
      });
      setSuccess(`Puzzle created (id: ${res.id})`);
      setTitle("");
      setAuthor("");
      setCanonRepr("");
      setWidth("");
      setHeight("");
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
          setTimeout(() => reject(new Error("Parsing timed out (60s)")), PARSE_TIMEOUT_MS)
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
        <div style={{ display: "flex", gap: "1rem" }}>
          <div style={{ ...fieldStyle, flex: 1 }}>
            <label>Width</label>
            <input style={inputStyle} type="number" value={width} onChange={(e) => setWidth(e.target.value)} />
          </div>
          <div style={{ ...fieldStyle, flex: 1 }}>
            <label>Height</label>
            <input style={inputStyle} type="number" value={height} onChange={(e) => setHeight(e.target.value)} />
          </div>
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
              <span style={{ fontSize: "0.85rem" }}>Parsing image with Gemini Vision...</span>
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
          <label>Canon repr (JSON) *</label>
          <textarea
            style={{ ...inputStyle, minHeight: 120, fontFamily: "monospace", fontSize: "0.8rem" }}
            value={canonRepr}
            onChange={(e) => setCanonRepr(e.target.value)}
          />
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
      <CollectionForm onCreated={loadData} />
      <QuestionForm puzzleTypes={puzzleTypes} collections={collections} />
    </div>
  );
}
