"""Source text and offset tracking for internal SymPy parsing."""

from collections.abc import Iterable
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class SourceToken:
    """One transformed character and its position in the raw source."""

    text: str
    raw_offset: int

    def __post_init__(self) -> None:
        """Validate that this token represents one transformed character."""
        if len(self.text) != 1:
            raise ValueError("SourceToken must contain exactly one character")

    def rewrite(self, text: str) -> tuple["SourceToken", ...]:
        return tuple(SourceToken(char, self.raw_offset) for char in text)


@dataclass(frozen=True, slots=True)
class SourceText:
    """Transformed tokens that retain positions in the immutable raw source."""

    raw_text: str
    tokens: tuple[SourceToken, ...]

    def __post_init__(self) -> None:
        """Validate that token provenance refers to the raw source in order."""
        if any(
            token.raw_offset < 0 or token.raw_offset >= len(self.raw_text)
            for token in self.tokens
        ):
            raise ValueError("SourceText offsets must refer to the raw source")
        if any(
            left.raw_offset > right.raw_offset
            for left, right in zip(self.tokens, self.tokens[1:], strict=False)
        ):
            raise ValueError("SourceText offsets must be nondecreasing")

    @property
    def text(self) -> str:
        return "".join(token.text for token in self.tokens)

    @classmethod
    def from_text(cls, text: str) -> "SourceText":
        return cls(
            text, tuple(SourceToken(char, offset) for offset, char in enumerate(text))
        )

    def replace(self, tokens: Iterable[SourceToken]) -> "SourceText":
        return SourceText(self.raw_text, tuple(tokens))
