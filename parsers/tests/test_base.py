from unittest.mock import patch

from PIL import Image

from puzzle_parsers import ParserRegistry, PuzzleData, PuzzleParser


class DummyParser(PuzzleParser):
    puzzle_type = "dummy"

    def _parse(self, image: Image.Image) -> PuzzleData:
        return PuzzleData(puzzle_type=self.puzzle_type)

    def validate(self, data: PuzzleData) -> bool:
        return data.puzzle_type == self.puzzle_type


def test_empty_registry():
    reg = ParserRegistry()
    assert reg.supported_types == []
    assert reg.get("nonexistent") is None


def test_register_and_retrieve():
    reg = ParserRegistry()
    reg.register(DummyParser)
    assert reg.supported_types == ["dummy"]
    assert reg.get("dummy") is DummyParser


@patch("puzzle_parsers.base.validate_canon")
def test_parser_parse(mock_validate):
    parser = DummyParser()
    img = Image.new("RGB", (10, 10))
    result = parser.parse(img)
    assert result.puzzle_type == "dummy"
    assert result.grid == {}
    mock_validate.assert_called_once_with("dummy", {})


def test_parser_validate():
    parser = DummyParser()
    valid = PuzzleData(puzzle_type="dummy")
    invalid = PuzzleData(puzzle_type="other")
    assert parser.validate(valid) is True
    assert parser.validate(invalid) is False
