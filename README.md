# Logic Puzzle Platform

A platform for parsing logic puzzle images into structured data and playing them interactively via a web interface.

## Components

### Parsers (`parsers/`)
Python package that converts scanned puzzle images into JSON representations. Extensible plugin system — add new puzzle types by implementing the `PuzzleParser` interface.

### Player (`player/`)
AWS serverless web application for playing puzzles:
- **frontend/** — React + TypeScript (Vite)
- **api/** — Lambda functions (TypeScript, Node.js)
- **infra/** — AWS CDK infrastructure

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Parsers | Python 3.11+, Pydantic, Pillow |
| Frontend | React 18, TypeScript, Vite |
| API | AWS Lambda (Node.js/TypeScript) |
| Database | Aurora Serverless v2 (MySQL) |
| IaC | AWS CDK (TypeScript) |

## Getting Started

### Parsers
```bash
cd parsers
pip install -e ".[dev]"
pytest
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
