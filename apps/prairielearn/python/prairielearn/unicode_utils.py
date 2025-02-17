"""Utilities for working with unicode strings."""

from text_unidecode import unidecode


def full_unidecode(input_str: str) -> str:
    """Do unidecode of input and replace the unicode minus with the normal one."""
    return unidecode(input_str.replace("\u2212", "-"))
