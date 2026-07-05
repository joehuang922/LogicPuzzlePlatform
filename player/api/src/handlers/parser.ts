import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { GoogleGenAI } from "@google/genai";

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }
  return new GoogleGenAI({ apiKey });
}

function response(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(body),
  };
}

const SUDOKU_PROMPT = `You are a puzzle image parser. Extract the sudoku grid from this image.

Return ONLY a JSON object in this exact format:
{"hints": [[...],...]}

Where "hints" is a 9x9 array of integers. Use 0 for empty cells, and the digit (1-9) for filled cells.
Read carefully row by row, left to right, top to bottom. Double-check your work.`;

const COMBO_SUDOKU_PROMPT = `You are a puzzle image parser. Extract the combo-sudoku grid from this image.

A combo-sudoku consists of multiple overlapping 9x9 sudoku subboards arranged in a cross or other pattern.
Each subboard overlaps with neighbors by sharing a 3x3 box.

Return ONLY a JSON object in this exact format:
{"subboards": [{"x": <room_x>, "y": <room_y>, "hints": [[...],...]},...]}

Where each subboard has:
- "x": the horizontal room position (0-indexed, in units of 3x3 boxes from the left)
- "y": the vertical room position (0-indexed, in units of 3x3 boxes from the top)
- "hints": a 9x9 array of integers (0 for empty, 1-9 for filled)

Identify each subboard's position by looking at the overall layout. Read each subboard's digits carefully, row by row.`;

function getPrompt(puzzleType: number): string {
  switch (puzzleType) {
    case 1: return SUDOKU_PROMPT;
    case 2: return COMBO_SUDOKU_PROMPT;
    default: return SUDOKU_PROMPT;
  }
}

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  if (event.httpMethod !== "POST") {
    return response(405, { error: "Method not allowed" });
  }

  if (!event.body) return response(400, { error: "Missing request body" });

  const body = JSON.parse(event.body);
  const { image, puzzleType } = body as { image: string; puzzleType: number };

  if (!image || !puzzleType) {
    return response(400, { error: "image (base64) and puzzleType are required" });
  }

  const mimeType = image.startsWith("/9j/") ? "image/jpeg" : "image/png";

  try {
    const client = getClient();
    const result = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data: image } },
            { text: getPrompt(puzzleType) },
          ],
        },
      ],
    });

    const text = result.text ?? "";

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return response(422, { error: "Could not extract JSON from model response", raw: text });
    }

    const canon = JSON.parse(jsonMatch[0]);
    return response(200, { canon });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Parse failed";
    return response(500, { error: message });
  }
}
