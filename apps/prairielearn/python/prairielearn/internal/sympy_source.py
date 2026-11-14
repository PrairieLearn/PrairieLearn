"""Source text and offset tracking for internal SymPy parsing."""

from collections.abc import Iterable, Iterator, Sequence
from dataclasses import dataclass
from io import StringIO
from tokenize import TokenInfo, generate_tokens


@dataclass(frozen=True, slots=True)
class SourceSpan:
    """Half-open offsets into raw symbolic input."""

    start: int
    end: int


@dataclass(frozen=True, slots=True)
class MappedChar:
    """One transformed character and its offset in the raw source."""

    value: str
    raw_offset: int

    def __post_init__(self) -> None:
        """Validate that this token represents one transformed character."""
        if len(self.value) != 1:
            raise ValueError(f"{type(self)} must contain exactly one character")

    def rewrite(self, text: Sequence[str]) -> tuple["MappedChar", ...]:
        return tuple(MappedChar(char, self.raw_offset) for char in text)


@dataclass(frozen=True, slots=True)
class MappedText:
    """Transformed characters mapped to offsets in the immutable raw source."""

    raw_text: str
    chars: tuple[MappedChar, ...]

    def __post_init__(self) -> None:
        """Validate that token provenance refers to the raw source in order."""
        if any(
            token.raw_offset < 0 or token.raw_offset >= len(self.raw_text)
            for token in self.chars
        ):
            raise ValueError("MappedText offsets must refer to the raw source")
        if any(
            left.raw_offset > right.raw_offset
            for left, right in zip(self.chars, self.chars[1:], strict=False)
        ):
            raise ValueError("MappedText offsets must be nondecreasing")

    def text(self) -> str:
        return "".join(token.value for token in self.chars)

    def tokenize(self) -> Iterator[tuple[int, TokenInfo]]:
        stream = StringIO(self.text())
        row_start = 0

        def readline() -> str:
            nonlocal row_start
            row_start = stream.tell()
            return stream.readline()

        for token in generate_tokens(readline):
            yield row_start + token.start[1], token

    @classmethod
    def from_raw_text(cls, text: str) -> "MappedText":
        """Make a new MappedText with the default source offsets"""
        return cls(
            text,
            tuple(MappedChar(char, offset) for offset, char in enumerate(text)),
        )

    def rebuild(
        self,
        parts: Iterable[MappedChar | tuple[MappedChar, ...]],
    ) -> "MappedText":
        """Build transformed source from individual characters or rewritten runs."""
        return MappedText(
            self.raw_text,
            tuple(
                char
                for part in parts
                for char in (part if isinstance(part, tuple) else (part,))
            ),
        )
