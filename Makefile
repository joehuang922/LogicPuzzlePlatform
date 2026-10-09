PARSERS_PYTHON = parsers/.venv/bin/python

# Local authoring workflow: parse single images on this machine (fast, no Lambda
# timeout) and author through the existing Admin UI. Run the two targets below in
# separate terminals, then open the frontend and go to Admin.
PARSER_PORT ?= 8000

.PHONY: parse-combo-sudoku install-parsers author-parser author-ui debug-parser

parse-combo-sudoku:
	@$(PARSERS_PYTHON) -m puzzle_parsers.combo_sudoku $(ARGS)

# Parser debugging harness: dump geometry images, a by-prediction clue montage,
# the parsed board JSON + histogram for one image, so we can refine a parser.
# Usage: make debug-parser NAME=nurikabe IMG=~/scan.jpg   (add ORACLE=1 for the
# Gemini confusion matrix). Writes to /tmp/parser_debug/<name>/.
debug-parser:
	@$(PARSERS_PYTHON) parsers/tools/debug_parser.py $(NAME) "$(IMG)" $(if $(ORACLE),--oracle,) $(if $(OUT),--out $(OUT),)

install-parsers:
	cd parsers && python3 -m venv .venv && .venv/bin/pip install -e ".[all,dev]"

# Terminal 1: local EasyOCR parser server (speaks the same contract as the Lambda).
author-parser:
	PARSER_PORT=$(PARSER_PORT) $(PARSERS_PYTHON) parsers/local_server.py

# Terminal 2: frontend dev server pointed at the local parser. Create still hits
# the deployed API (VITE_API_URL in player/frontend/.env.local), so the
# server-side uniqueness gate runs exactly as in production.
author-ui:
	cd player/frontend && VITE_PARSER_URL=http://localhost:$(PARSER_PORT) npm run dev
