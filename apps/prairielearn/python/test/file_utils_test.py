import base64
import io

import pytest
from prairielearn.internal.file_utils import filelike_to_string


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (None, b""),
        (b"", b""),
        (b"abc", b"abc"),
        ("é", "é".encode()),
        (io.BytesIO(b"abc"), b"abc"),
        (io.StringIO("é"), "é".encode()),
    ],
)
def test_file_encoding_without_limit(value: object, expected: bytes) -> None:
    assert base64.b64decode(filelike_to_string(value)) == expected


@pytest.mark.parametrize(
    "value", [b"abc", "abc", io.BytesIO(b"abc"), io.StringIO("abc")]
)
def test_file_at_limit(value: object) -> None:
    assert filelike_to_string(value, 3) == base64.b64encode(b"abc").decode()


@pytest.mark.parametrize(
    "value", [b"abcd", "abcd", "éé", io.BytesIO(b"abcd"), io.StringIO("éé")]
)
def test_oversized_file(value: object) -> None:
    with pytest.raises(ValueError, match="size limit of 3 bytes"):
        filelike_to_string(value, 3)


def test_bounded_read() -> None:
    stream = io.BytesIO(b"a" * 100)
    with pytest.raises(ValueError, match="size limit"):
        filelike_to_string(stream, 3)
    assert stream.tell() == 4


def test_binary_buffer_byte_size() -> None:
    buffer = memoryview(b"abcd").cast("H")
    with pytest.raises(ValueError, match="size limit"):
        filelike_to_string(buffer, 3)
