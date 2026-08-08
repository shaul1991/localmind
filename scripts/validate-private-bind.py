#!/usr/bin/env python3
"""Fail-closed validator for a reachable private/overlay MCP bind address."""
from __future__ import annotations

import argparse
import ipaddress
import json
import os
import pathlib
import subprocess
from collections.abc import Iterable
from typing import Any

APPROVED_NETWORKS = tuple(
    ipaddress.ip_network(cidr)
    for cidr in (
        "10.0.0.0/8",
        "172.16.0.0/12",
        "192.168.0.0/16",
        "100.64.0.0/10",  # Shared address space used by Tailscale.
        "fc00::/7",       # IPv6 unique-local addresses.
    )
)
INVALID_ADDRESS_FLAGS = {"tentative", "dadfailed", "deprecated"}


def approved(address: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return any(address.version == network.version and address in network for network in APPROVED_NETWORKS)


def load_ip_interfaces(path: str | None) -> Any:
    if path is not None:
        if os.environ.get("LOCALMIND_BIND_VALIDATOR_TEST") != "1":
            raise SystemExit("--ip-json 옵션은 테스트 환경에서만 사용할 수 있습니다.")
        try:
            return json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise SystemExit("테스트용 네트워크 인터페이스 정보를 읽을 수 없습니다.") from error

    try:
        completed = subprocess.run(
            ["ip", "-j", "address", "show"],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        return json.loads(completed.stdout)
    except (OSError, subprocess.CalledProcessError, json.JSONDecodeError) as error:
        raise SystemExit("`ip -j address show` 명령으로 로컬 네트워크 인터페이스를 확인할 수 없습니다.") from error


def reachable_addresses(interfaces: Any) -> Iterable[ipaddress.IPv4Address | ipaddress.IPv6Address]:
    if not isinstance(interfaces, list):
        raise SystemExit("`ip -j address show` 명령이 예상하지 못한 형식으로 응답했습니다.")

    for interface in interfaces:
        if not isinstance(interface, dict):
            continue
        flags = interface.get("flags")
        state = interface.get("operstate")
        if not isinstance(flags, list) or not all(isinstance(flag, str) for flag in flags):
            continue
        interface_flags = set(flags)
        # Tunnel devices such as tailscale0 and WireGuard commonly report UNKNOWN
        # while remaining usable, but they must still have the kernel UP flag.
        if "UP" not in interface_flags or "LOOPBACK" in interface_flags:
            continue
        if state not in {"UP", "UNKNOWN"}:
            continue

        addr_info = interface.get("addr_info")
        if not isinstance(addr_info, list):
            continue
        for info in addr_info:
            if not isinstance(info, dict) or info.get("scope") != "global":
                continue
            raw_address = info.get("local")
            address_flags = info.get("flags", [])
            if not isinstance(raw_address, str):
                continue
            if not isinstance(address_flags, list) or not all(
                isinstance(flag, str) for flag in address_flags
            ):
                continue
            if INVALID_ADDRESS_FLAGS.intersection(address_flags):
                continue
            if any(info.get(flag) is True for flag in INVALID_ADDRESS_FLAGS):
                continue
            try:
                yield ipaddress.ip_address(raw_address)
            except ValueError:
                continue


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("address")
    parser.add_argument("--ip-json", help=argparse.SUPPRESS)
    args = parser.parse_args()

    try:
        address = ipaddress.ip_address(args.address)
    except ValueError as error:
        raise SystemExit("bind 주소에는 올바른 IP 주소를 입력해야 합니다.") from error

    if not approved(address):
        raise SystemExit(
            "bind 주소는 RFC1918 사설 IPv4, Tailscale CGNAT(100.64.0.0/10), IPv6 ULA 중 하나여야 합니다."
        )

    interfaces = load_ip_interfaces(args.ip_json)
    if address not in set(reachable_addresses(interfaces)):
        raise SystemExit("bind 주소가 사용 가능한 UP 상태의 non-loopback 로컬 인터페이스에 할당되어 있지 않습니다.")

    print(address)


if __name__ == "__main__":
    main()
