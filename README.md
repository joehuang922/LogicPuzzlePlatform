# Logic Puzzle Platform

A platform for parsing logic puzzle images into structured data and playing them interactively on web and Android.

## Components

### Parsers (`parsers/`)
Python package that converts scanned puzzle images into JSON representations. Extensible plugin system — add new puzzle types by implementing the `PuzzleParser` interface. Registered in `parsers/lambda_handler.py`.

### Player (`player/`)
- **frontend/** — React + TypeScript (Vite) web client, admin, and editors
- **android/** — Jetpack Compose native player
- **solver/** — TypeScript solving/hint engine (gates auto-solve, powers hints)
- **api/** — Lambda functions (TypeScript, Node.js)
- **infra/** — AWS CDK infrastructure

## Puzzle Type Completeness

**Baseline (table stakes).** Every onboarded type ships these — all 25 have them, so they're omitted from the table below: **Doc** (`docs/<name>/`), **Schema** (`schemas/canon/<name>.json`), **Schema validator** (canon shape-check at ingest, `player/api/src/lib/schema.ts`), **DB** row (`player/api/seed.sql`), **Types** (`player/frontend/src/types/canon.ts`), **Board** (`<Name>Board.tsx`, incl. the completion check that fires `onComplete`), **Renderer** (registered in `player/frontend/src/main.tsx`), and **Extractor** (maps the player's in-progress board state into the canonical answer JSON for persistence, `player/frontend/src/extractors/<name>.ts`). Together these make a type parseable, storable, and playable on the web.

**Differentiating components.** These vary by type:

- **Conflicts** — live, rule-based conflict/error highlighting *during* solving (a sub-capability of the Board, gated by the `liveValidate` toggle). Distinct from the schema validator (puzzle shape at ingest) and the completion check (only detects a fully-solved board).
- **Editor** — web editor component (`player/frontend/src/components/<Name>Editor.tsx`).
- **Progress** — progress calculator returning 0–100 for a partial solution (`player/frontend/src/progress/<name>.ts`).
- **Parser** — image parser (`parsers/src/puzzle_parsers/<name>/`) + lambda registration.
- **Android** — Kotlin engine + Compose board (`player/android/.../puzzle` + `.../ui/board`).
- **Solver** — solving/hint plugin (`player/solver/src/plugins/<name>/`; Android hinter).

Legend: ✅ = implemented · 🟡 = partial · blank = not yet. In the **Parser** column, **★** marks a parser whose extraction accuracy is high enough to need no manual calibration/editorial correction after parsing — a ✅ without a ★ works but still needs a human to verify/fix its output.

| ID | Puzzle Type | Conflicts | Editor | Progress | Parser | Android | Solver |
|----|-------------|:--------:|:------:|:--------:|:------:|:-------:|:------:|
| 1  | sudoku        | ✅ | ✅ | ✅ | ✅★ | ✅ | ✅ |
| 2  | combo-sudoku  |    | ✅ | ✅ | ✅ |    |    |
| 3  | nurimaze      |    | ✅ | ✅ | ✅ | ✅ |    |
| 4  | double-choco  |    | ✅ | ✅ | ✅ |    |    |
| 5  | slitherlink   |    | ✅ | ✅ | ✅ | ✅ | ✅ |
| 6  | nonogram      | ✅ | ✅ | ✅ | ✅ | ✅ |    |
| 7  | masyu         | ✅ | ✅ | ✅ | ✅ | ✅ |    |
| 8  | pencils       |    | ✅ | ✅ | ✅ |    |    |
| 9  | nuritwin      |    | ✅ | ✅ | ✅ |    |    |
| 10 | slalom        |    | ✅ | ✅ | ✅ |    |    |
| 11 | shakashaka    |    | ✅ | ✅ | ✅ |    |    |
| 12 | kakuro        | ✅ | ✅ | ✅ | ✅ | ✅ |    |
| 13 | yajilin       |    | ✅ | ✅ | ✅ |    |    |
| 14 | fillomino     |    | ✅ | ✅ | ✅ | ✅ |    |
| 15 | lits          |    | ✅ | ✅ | ✅ | ✅ | ✅ |
| 16 | choco-banana  |    | ✅ | ✅ | ✅ |    |    |
| 17 | number-link   |    | ✅ | ✅ | ✅ |    |    |
| 18 | akari         | 🟡 | ✅ | ✅ | ✅ |    |    |
| 19 | hell-golf     |    | ✅ | ✅ | ✅ | ✅ |    |
| 20 | tentaishow    |    | ✅ | ✅ | ✅ |    |    |
| 21 | heyawake      |    | ✅ | ✅ | ✅ |    |    |
| 22 | shikaku       |    | ✅ | ✅ | ✅ |    |    |
| 23 | norinori      |    | ✅ | ✅ | ✅ |    |    |
| 24 | nurikabe      |    | ✅ | ✅ | ✅ |    |    |
| 25 | ripple-effect |    | ✅ | ✅ | ✅ |    |    |

**Summary:** all 25 types are fully playable on the web, with editors, progress, and parsers complete across the board. The gaps are: **live conflict highlighting** (4 full — sudoku, nonogram, masyu, kakuro — plus a partial akari, which flags only mutually-illuminating bulbs); **parser accuracy** (only sudoku ★ parses cleanly enough to skip manual calibration; the other 24 need editorial correction); **Android** (9 — sudoku, slitherlink, nonogram, masyu, kakuro, hell-golf, fillomino, lits, nurimaze); and the **solver/hint engine** (3 — sudoku, plus gate-only exact solvers for lits and slitherlink).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Parsers | Python 3.10+, Pydantic, OpenCV, Pillow |
| OCR (paid) | Claude Vision API (anthropic SDK) |
| OCR (free) | EasyOCR |
| Frontend | React 18, TypeScript, Vite |
| API | AWS Lambda (Node.js/TypeScript) |
| Database | Aurora Serverless v2 (MySQL) |
| IaC | AWS CDK (TypeScript) |

## Getting Started

### Parsers
```bash
# Full install (both OCR backends)
make install-parsers

# Or manually:
cd parsers
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[all,dev]"
pytest
```

### Parsing a Puzzle Image

From the project root:
```bash
# Using Claude Vision (requires ANTHROPIC_API_KEY)
make parse-combo-sudoku ARGS="docs/combo-sudoku/PXL_20260512_033536040.jpg --backend claude -o output.json"

# Using EasyOCR (free, no API key)
make parse-combo-sudoku ARGS="docs/combo-sudoku/PXL_20260512_033536040.jpg --backend easyocr -o output.json"
```

Or directly with the venv:
```bash
parsers/.venv/bin/python -m puzzle_parsers.combo_sudoku <image> --backend <claude|easyocr> -o output.json
```

### Player (Frontend)
```bash
cd player
npm install
cd frontend
npm run dev
```

### Infrastructure
```bash
cd player/infra
npx cdk synth
npx cdk deploy --all
```

## CI/CD

Pushes to `main` automatically deploy all stacks via GitHub Actions (`.github/workflows/deploy.yml`).

### One-time Bootstrap Setup (admin)

The OIDC provider and deploy IAM role are managed as a separate CDK app in `player/infra/bootstrap/`:

```bash
cd player/infra/bootstrap
npm install
npx cdk bootstrap          # if CDK hasn't been bootstrapped in this AWS account/region
npx cdk deploy
```

After deployment, the stack outputs the role ARN. Configure GitHub:

1. Go to repo **Settings > Secrets and variables > Actions**
2. Add secret: `AWS_ROLE_ARN` → the role ARN from the stack output
3. Add variable: `AWS_REGION` → your target region (e.g. `us-west-2`)
