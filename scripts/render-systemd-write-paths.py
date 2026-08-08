#!/usr/bin/env python3
"""Render installation-specific systemd ReadWritePaths safely."""

from __future__ import annotations

import json
import sys
import unicodedata


def quote_path(path: str) -> str:
    if not path.startswith("/"):
        raise ValueError(f"absolute path required: {path!r}")
    if any(unicodedata.category(character) == "Cc" for character in path):
        raise ValueError("path contains a forbidden control character")
    escaped = path.replace("%", "%%")
    return json.dumps(escaped, ensure_ascii=False)


def main(paths: list[str]) -> int:
    if not paths:
        print("at least one writable path is required", file=sys.stderr)
        return 2
    try:
        rendered = " ".join(quote_path(path) for path in paths)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    print("[Service]")
    print(f"ReadWritePaths={rendered}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
