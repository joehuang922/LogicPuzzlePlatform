export function extractBase64(dataUrl: string): string {
  return dataUrl.split(",")[1];
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read blob"));
    reader.readAsDataURL(blob);
  });
}

// Phone photos are routinely 3000-4000px on the long edge. The parser's grid
// detection and the Gemini montage work fine from ~1600px, but sending the full
// image inflates the base64 payload and the per-cell montage tiles, slowing the
// server-side parse. Downscale on the longest edge before upload; smaller images
// are passed through untouched. Falls back to the original data URL on any
// decode/encode failure so a parse is never blocked by resizing.
const MAX_PARSE_EDGE = 1600;

export async function downscaleDataUrlForParse(
  dataUrl: string,
  maxEdge: number = MAX_PARSE_EDGE,
): Promise<string> {
  try {
    const img = await loadImage(dataUrl);
    const longest = Math.max(img.width, img.height);
    if (longest <= maxEdge) return dataUrl;

    const scale = maxEdge / longest;
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, w, h);
    // JPEG keeps the payload small; the parser only needs legible digits/lines.
    return canvas.toDataURL("image/jpeg", 0.9);
  } catch {
    return dataUrl;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to decode image"));
    img.src = src;
  });
}
