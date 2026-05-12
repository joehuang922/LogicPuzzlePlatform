PARSERS_PYTHON = parsers/.venv/bin/python

.PHONY: parse-combo-sudoku install-parsers

parse-combo-sudoku:
	@$(PARSERS_PYTHON) -m puzzle_parsers.combo_sudoku $(ARGS)

install-parsers:
	cd parsers && python3 -m venv .venv && .venv/bin/pip install -e ".[all,dev]"
