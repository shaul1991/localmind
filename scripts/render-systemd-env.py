#!/usr/bin/env python3
"""systemd EnvironmentFile 항목을 안전하게 직렬화한다."""
from __future__ import annotations

import json
import re
import sys
import unicodedata

KEY_RE = re.compile(r"^[A-Z_][A-Z0-9_]*$")


def render(item: str) -> str:
    if "=" not in item:
        raise ValueError("환경 변수는 KEY=VALUE 형식이어야 합니다.")
    key, value = item.split("=", 1)
    if not KEY_RE.fullmatch(key):
        raise ValueError(f"올바르지 않은 환경 변수 이름입니다: {key!r}")
    if any(unicodedata.category(character) == "Cc" for character in value):
        raise ValueError(f"환경 변수 {key} 값에 제어 문자를 사용할 수 없습니다.")
    return f"{key}={json.dumps(value, ensure_ascii=False)}"


def main(items: list[str]) -> int:
    if not items:
        print("직렬화할 환경 변수가 하나 이상 필요합니다.", file=sys.stderr)
        return 2
    try:
        for item in items:
            print(render(item))
    except ValueError as error:
        print(error, file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
