import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

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

const SUDOKU_PROMPT = `You are analyzing a photograph of a standard 9x9 Sudoku puzzle.

Read the grid carefully, row by row, from top to bottom, left to right.
For each cell: output the printed/given digit (1-9) if one exists, or 0 if the cell is empty.

CRITICAL RULES:
- The grid has exactly 9 rows and 9 columns.
- Read digits in their EXACT positions. Row 1 is the topmost row. Column 1 is the leftmost column.
- Only include pre-printed/given clue digits. Ignore any pencil marks, handwritten notes, or candidate numbers.
- Output ONLY a JSON object matching this exact format, no explanation:

{"hints":[[r1c1,r1c2,...,r1c9],[r2c1,...,r2c9],...,[r9c1,...,r9c9]]}

where each value is 0-9 (0 = empty).`;

const COMBO_SUDOKU_PROMPT = `You are analyzing a photograph of a Combo Sudoku (also known as Samurai Sudoku or overlapping Sudoku).

This puzzle has multiple overlapping 9x9 Sudoku sub-boards arranged in a pattern (typically a cross/plus shape with 5 boards, but could be 2, 3, or more).

For EACH sub-board, read its 9x9 grid row by row, top to bottom, left to right.
For each cell: output the printed/given digit (1-9) if one exists, or 0 if empty.

CRITICAL RULES:
- Identify each separate 9x9 sub-board and its position in the layout.
- Sub-boards overlap — shared cells will have the same digit in both boards.
- Positions are measured in units of 3x3 boxes from the top-left corner of the full puzzle grid:
  - A standard 5-board Samurai: boards at positions (0,0), (2,0), (1,1), (0,2), (2,2)
  - For a 2-board overlap: typically (0,0) and (1,0) or (0,0) and (0,1)
- Only include pre-printed/given clue digits. Ignore pencil marks or candidates.
- Output ONLY a JSON object matching this format, no explanation:

{"subboards":[{"x":0,"y":0,"hints":[[r1c1,...,r1c9],...,[r9c1,...,r9c9]]},{"x":2,"y":0,"hints":[[...],...]},...]}"

where x,y are positions in 3-cell units from top-left, and each hints value is 0-9 (0 = empty).`;

async function callGemini(imageBase64: string, puzzleType: number): Promise<Record<string, unknown>> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  const prompt = puzzleType === 2 ? COMBO_SUDOKU_PROMPT : SUDOKU_PROMPT;
  const model = "gemini-2.5-flash";

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errBody}`);
  }

  const data = await res.json();
  const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini returned no content");
  }

  return JSON.parse(text);
}

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  if (!event.body) {
    return response(400, { error: "Missing request body" });
  }

  try {
    const body = JSON.parse(event.body);
    const { image, puzzleType } = body;

    if (!image || !puzzleType) {
      return response(400, { error: "image (base64) and puzzleType are required" });
    }

    const canon = await callGemini(image, puzzleType);
    return response(200, { canon });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Parse failed";
    return response(500, { error: message });
  }
}
