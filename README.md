# Logic Puzzle Platform

A platform for parsing logic puzzle images into structured data and playing them interactively via a web interface.

## Components

### Parsers (`parsers/`)
Python package that converts scanned puzzle images into JSON representations. Extensible plugin system — add new puzzle types by implementing the `PuzzleParser` interface.

**Supported puzzle types:**
- **Combo-Sudoku** — overlapping 9x9 sudoku sub-boards arranged in a cross pattern

### Player (`player/`)
AWS serverless web application for playing puzzles:
- **frontend/** — React + TypeScript (Vite)
- **api/** — Lambda functions (TypeScript, Node.js)
- **infra/** — AWS CDK infrastructure

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
