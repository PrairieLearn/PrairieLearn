"""Encode generated files for transport to Node."""

import base64
import io
from typing import Any


def filelike_to_string(filelike: Any, max_bytes: int | None = None) -> str:
    """Read and encode a generated file, optionally limiting its byte size."""
    if filelike is None:
        filelike = ""

    if isinstance(filelike, io.IOBase):
        filelike.seek(0)
        filelike = (
            filelike.read() if max_bytes is None else filelike.read(max_bytes + 1)
        )

    if isinstance(filelike, str):
        # Reject oversized text before allocating its UTF-8 representation.
        if max_bytes is not None and len(filelike) > max_bytes:
            raise ValueError(
                f"Generated file exceeds the size limit of {max_bytes} bytes"
            )
        filelike = filelike.encode("utf-8")

    if max_bytes is not None and memoryview(filelike).nbytes > max_bytes:
        raise ValueError(f"Generated file exceeds the size limit of {max_bytes} bytes")

    return base64.b64encode(filelike).decode()
