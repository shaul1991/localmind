#!/usr/bin/env python3
"""Read-only structural validator for a research evidence pack."""

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Sequence, Set, Tuple


EXPECTED_FILES = {
    "report.md",
    "sources.jsonl",
    "evidence.jsonl",
    "claims.jsonl",
    "run-manifest.json",
}
MANIFEST_PATHS = {
    "report": "report.md",
    "sources": "sources.jsonl",
    "evidence": "evidence.jsonl",
    "claims": "claims.jsonl",
}
ID_PATTERNS = {
    "run_id": re.compile(r"^R-[0-9]{3,}$"),
    "source_id": re.compile(r"^S-[0-9]{3,}$"),
    "evidence_id": re.compile(r"^E-[0-9]{3,}$"),
    "claim_id": re.compile(r"^C-[0-9]{3,}$"),
}
RUN_STATES = {"completed", "incomplete"}
AUTHORITIES = {"T1", "T2", "T3", "T4"}
EVIDENCE_RELATIONS = {"supports", "refutes"}
CLAIM_STATES = {"supported", "contested", "unverified", "withdrawn"}


def error(errors: List[str], message: str) -> None:
    errors.append(message)


def load_json(path: Path, errors: List[str]) -> Any:
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        error(errors, "%s: invalid JSON: %s" % (path.name, exc))
        return None


def load_jsonl(path: Path, errors: List[str]) -> List[Dict[str, Any]]:
    records: List[Dict[str, Any]] = []
    try:
        with path.open("r", encoding="utf-8") as handle:
            for number, line in enumerate(handle, 1):
                if not line.strip():
                    continue
                try:
                    value = json.loads(line)
                except json.JSONDecodeError as exc:
                    error(errors, "%s:%d: invalid JSON: %s" % (path.name, number, exc))
                    continue
                if not isinstance(value, dict):
                    error(errors, "%s:%d: JSONL record must be an object" % (path.name, number))
                    continue
                value["__line__"] = number
                records.append(value)
    except (OSError, UnicodeError) as exc:
        error(errors, "%s: unreadable: %s" % (path.name, exc))
    return records


def require_fields(record: Dict[str, Any], fields: Sequence[str], label: str, errors: List[str]) -> bool:
    missing = [field for field in fields if field not in record]
    if missing:
        error(errors, "%s: missing required fields: %s" % (label, ", ".join(missing)))
        return False
    return True


def require_string(record: Dict[str, Any], field: str, label: str, errors: List[str]) -> bool:
    value = record.get(field)
    if not isinstance(value, str) or not value.strip():
        error(errors, "%s: %s must be a non-empty string" % (label, field))
        return False
    return True


def require_id(value: Any, field: str, label: str, errors: List[str]) -> bool:
    if not isinstance(value, str) or not ID_PATTERNS[field].fullmatch(value):
        error(errors, "%s: invalid %s %r" % (label, field, value))
        return False
    return True


def require_string_list(record: Dict[str, Any], field: str, label: str, errors: List[str]) -> bool:
    value = record.get(field)
    if not isinstance(value, list) or any(not isinstance(item, str) for item in value):
        error(errors, "%s: %s must be an array of strings" % (label, field))
        return False
    return True


def validate_unique_ids(
    records: Sequence[Dict[str, Any]], field: str, file_name: str, errors: List[str]
) -> Set[str]:
    seen: Set[str] = set()
    for record in records:
        label = "%s:%s" % (file_name, record.get("__line__", "?"))
        value = record.get(field)
        if not require_id(value, field, label, errors):
            continue
        if value in seen:
            error(errors, "%s: duplicate %s" % (label, value))
        seen.add(value)
    return seen


def validate_bundle(bundle: Path) -> Tuple[List[str], int, int, int, int]:
    errors: List[str] = []
    if bundle.is_symlink():
        return (["bundle directory must not be a symlink"], 0, 0, 0, 0)
    try:
        entries = list(bundle.iterdir())
    except OSError as exc:
        return (["cannot read bundle directory: %s" % exc], 0, 0, 0, 0)

    actual = {entry.name for entry in entries}
    missing = sorted(EXPECTED_FILES - actual)
    extra = sorted(actual - EXPECTED_FILES)
    if missing:
        error(errors, "missing files: %s" % ", ".join(missing))
    if extra:
        error(errors, "unexpected files: %s" % ", ".join(extra))
    for name in sorted(EXPECTED_FILES & actual):
        target = bundle / name
        if target.is_symlink() or not target.is_file():
            error(errors, "%s: expected a regular non-symlink file" % name)

    if errors:
        return (errors, 0, 0, 0, 0)

    manifest = load_json(bundle / "run-manifest.json", errors)
    if not isinstance(manifest, dict):
        if manifest is not None:
            error(errors, "run-manifest.json: root must be an object")
        return (errors, 0, 0, 0, 0)

    manifest_fields = ["schema_version", "run_id", "status", "report", "sources", "evidence", "claims"]
    require_fields(manifest, manifest_fields, "run-manifest.json", errors)
    if type(manifest.get("schema_version")) is not int or manifest.get("schema_version") != 1:
        error(errors, "run-manifest.json: unsupported schema_version %r" % manifest.get("schema_version"))
    require_id(manifest.get("run_id"), "run_id", "run-manifest.json", errors)
    if manifest.get("status") not in RUN_STATES:
        error(errors, "run-manifest.json: invalid status %r" % manifest.get("status"))
    for field, expected in MANIFEST_PATHS.items():
        if manifest.get(field) != expected:
            error(errors, "run-manifest.json: %s must be %s" % (field, expected))

    sources = load_jsonl(bundle / "sources.jsonl", errors)
    evidence = load_jsonl(bundle / "evidence.jsonl", errors)
    claims = load_jsonl(bundle / "claims.jsonl", errors)
    source_ids = validate_unique_ids(sources, "source_id", "sources.jsonl", errors)
    evidence_ids = validate_unique_ids(evidence, "evidence_id", "evidence.jsonl", errors)
    claim_ids = validate_unique_ids(claims, "claim_id", "claims.jsonl", errors)
    run_id = manifest.get("run_id")

    for record in sources:
        label = "sources.jsonl:%s" % record.get("__line__", "?")
        if not require_fields(record, ["source_id", "run_id", "url", "title", "authority", "checked_at"], label, errors):
            continue
        require_id(record.get("run_id"), "run_id", label, errors)
        for field in ("url", "title", "checked_at"):
            require_string(record, field, label, errors)
        if record.get("run_id") != run_id:
            error(errors, "%s: run_id does not match manifest" % label)
        if record.get("authority") not in AUTHORITIES:
            error(errors, "%s: invalid authority %r" % (label, record.get("authority")))

    for record in evidence:
        label = "evidence.jsonl:%s" % record.get("__line__", "?")
        if not require_fields(record, ["evidence_id", "run_id", "source_id", "locator", "summary", "relation"], label, errors):
            continue
        require_id(record.get("run_id"), "run_id", label, errors)
        require_id(record.get("source_id"), "source_id", label, errors)
        for field in ("locator", "summary"):
            require_string(record, field, label, errors)
        if record.get("run_id") != run_id:
            error(errors, "%s: run_id does not match manifest" % label)
        if record.get("source_id") not in source_ids:
            error(errors, "%s: unknown source reference %s" % (label, record.get("source_id")))
        if record.get("relation") not in EVIDENCE_RELATIONS:
            error(errors, "%s: invalid relation %r" % (label, record.get("relation")))

    covered = 0
    for record in claims:
        label = "claims.jsonl:%s" % record.get("__line__", "?")
        if not require_fields(record, ["claim_id", "run_id", "text", "status", "evidence_ids", "conflicts_with"], label, errors):
            continue
        require_id(record.get("run_id"), "run_id", label, errors)
        require_string(record, "text", label, errors)
        evidence_list_ok = require_string_list(record, "evidence_ids", label, errors)
        conflicts_ok = require_string_list(record, "conflicts_with", label, errors)
        if record.get("run_id") != run_id:
            error(errors, "%s: run_id does not match manifest" % label)
        status = record.get("status")
        if status not in CLAIM_STATES:
            error(errors, "%s: invalid or unsupported status %r" % (label, status))
        linked_evidence = record.get("evidence_ids") if evidence_list_ok else []
        if linked_evidence:
            covered += 1
        if status in {"supported", "contested"} and not linked_evidence:
            error(errors, "%s: %s claim requires evidence" % (label, status))
        for evidence_id in linked_evidence:
            if evidence_id not in evidence_ids:
                error(errors, "%s: unknown evidence reference %s" % (label, evidence_id))
        for conflict_id in record.get("conflicts_with") if conflicts_ok else []:
            if conflict_id not in claim_ids:
                error(errors, "%s: unknown claim conflict reference %s" % (label, conflict_id))

    return (errors, len(sources), len(evidence), len(claims), covered)


def main(argv: Sequence[str]) -> int:
    parser = argparse.ArgumentParser(description="Validate a research evidence pack without modifying it.")
    parser.add_argument("bundle", type=Path, help="path to the exact five-file evidence pack")
    args = parser.parse_args(argv)
    if not args.bundle.is_dir():
        print("error: bundle path is not a directory: %s" % args.bundle, file=sys.stderr)
        return 2

    errors, sources, evidence, claims, covered = validate_bundle(args.bundle)
    if errors:
        for message in errors:
            print("error: %s" % message, file=sys.stderr)
        return 1
    print("valid: sources=%d evidence=%d claims=%d coverage=%d/%d" % (sources, evidence, claims, covered, claims))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
