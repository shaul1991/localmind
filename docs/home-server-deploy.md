# 홈서버 안전 자동 배포

홈서버는 15분마다 GitHub `main`의 새 SHA를 확인하며, 해당 SHA의 `CI`가 성공한 경우에만 release를 검증·전환한다.

## 설치

```bash
set -euo pipefail

test -x /usr/bin/node
test -x /usr/bin/npm
test -x /usr/bin/gh
test -x /usr/bin/openssl
command -v setfacl >/dev/null

: "${LOCALMIND_STATE_ROOT:?export LOCALMIND_STATE_ROOT=/absolute/path/to/localmind-state}"
: "${LOCALMIND_SHARED_NOTES:?export LOCALMIND_SHARED_NOTES=/absolute/path/to/shared-notes}"
: "${LOCALMIND_PRIVATE_NOTES:?export LOCALMIND_PRIVATE_NOTES=/absolute/path/to/private-notes}"
: "${LOCALMIND_MCP_BIND_HOST:?export LOCALMIND_MCP_BIND_HOST=<reachable-server-IP>; Tailscale users can run: export LOCALMIND_MCP_BIND_HOST=\$(tailscale ip -4)}"
: "${GH_TOKEN:?export a deploy-only GitHub token with Actions read permission}"
GH_TOKEN="$GH_TOKEN" gh auth status --active --hostname github.com >/dev/null

install -d -m 0700 -o root -g root /var/lib/localmind-deploy
git clone https://github.com/shaul1991/localmind.git /var/lib/localmind-deploy/source
cd /var/lib/localmind-deploy/source
LOCALMIND_MCP_BIND_HOST="$(python3 scripts/validate-private-bind.py "$LOCALMIND_MCP_BIND_HOST")"

cp .env.example .env
MCP_AUTH_TOKEN="$(openssl rand -hex 32)"
{
  printf '\nNOTES_DIR=%s,%s\n' "$LOCALMIND_SHARED_NOTES" "$LOCALMIND_PRIVATE_NOTES"
  printf 'BRAIN_INDEX=%s/brain-index.json\n' "$LOCALMIND_STATE_ROOT"
  printf 'QUERY_LOG=%s/query-log.jsonl\n' "$LOCALMIND_STATE_ROOT"
  printf 'LOCALMIND_DEPLOYMENT_ID=home-main\n'
  printf 'MCP_AUTH_TOKEN=%s\n' "$MCP_AUTH_TOKEN"
  printf 'MCP_HTTP_HOST=%s\nMCP_HTTP_PORT=8789\nMCP_HTTP_PATH=/mcp\n' "$LOCALMIND_MCP_BIND_HOST"
} >> .env

useradd --system --no-create-home --shell /usr/sbin/nologin localmind
useradd --system --no-create-home --shell /usr/sbin/nologin localmind-builder

# 설치 환경의 note/index/query-log 쓰기 루트를 명시한다.
NOTE_WRITE_PATHS=(
  "$LOCALMIND_STATE_ROOT"
  "$LOCALMIND_SHARED_NOTES"
  "$LOCALMIND_PRIVATE_NOTES"
)
write_paths_tmp="$(mktemp)"
trap 'rm -f "$write_paths_tmp"' EXIT
python3 scripts/render-systemd-write-paths.py "${NOTE_WRITE_PATHS[@]}" > "$write_paths_tmp"

# MCP 런타임만 지정한 루트를 읽고 쓸 수 있게 한다.
for d in "${NOTE_WRITE_PATHS[@]}"; do
  test -d "$d"
  parent="$(dirname "$d")"
  while [ "$parent" != / ]; do
    setfacl -m u:localmind:--x "$parent"
    parent="$(dirname "$parent")"
  done
  chgrp -R localmind "$d"
  chmod -R g+rwX "$d"
  find "$d" -type d -exec chmod g+s {} +
done

install -d -m 0750 -o root -g localmind /etc/localmind
install -d -m 0755 -o root -g root /opt/localmind/releases
install -d -m 0755 -o root -g root /usr/local/libexec
install -d -m 0755 -o root -g root /etc/systemd/system/localmind-mcp.service.d
install -m 0640 -o root -g localmind .env /etc/localmind/localmind.env
(umask 077; printf 'GH_TOKEN=%s\n' "$GH_TOKEN" > /etc/localmind/deploy.env)
chown root:root /etc/localmind/deploy.env
chmod 0600 /etc/localmind/deploy.env
install -m 0755 scripts/home-server-deploy.sh /usr/local/sbin/localmind-deploy
install -m 0755 scripts/render-systemd-write-paths.py /usr/local/libexec/localmind-render-systemd-write-paths
install -m 0644 deploy/systemd/localmind-deploy.service /etc/systemd/system/
install -m 0644 deploy/systemd/localmind-deploy.timer /etc/systemd/system/
install -m 0644 deploy/systemd/localmind-mcp.service /etc/systemd/system/
install -m 0644 "$write_paths_tmp" /etc/systemd/system/localmind-mcp.service.d/write-paths.conf
rm -f "$write_paths_tmp"
trap - EXIT
systemctl daemon-reload
```

원격 기기 간 연결에는 개인 사용을 무료로 시작하기 쉽고 별도 인바운드 포트 개방이 필요 없는 **Tailscale을 권장**한다. 설치 전에 홈서버에서 `export LOCALMIND_MCP_BIND_HOST="$(tailscale ip -4)"`로 bind 주소를 지정할 수 있다. 다만 Tailscale은 필수 의존성이 아니며 WireGuard·ZeroTier·기타 VPN 또는 접근 제어된 사설망도 사용할 수 있다. 설치기는 공인 주소를 허용하지 않으며 RFC1918 IPv4, Tailscale CGNAT(`100.64.0.0/10`), IPv6 ULA(`fc00::/7`) 중 실제 로컬 `UP`·non-loopback 인터페이스에 유효한 global-scope 주소로 할당된 값만 수용한다. WireGuard·ZeroTier에서 다른 주소 체계를 사용 중이라면 위 사설 대역 중 하나를 할당한다. 방화벽은 선택한 원격 네트워크 인터페이스에서만 8789/tcp를 허용한다. 공개 base unit은 특정 VPN service에 의존하지 않는다. Tailscale 같은 provider별 systemd ordering은 설치별 drop-in으로 추가한다.

최초 배포 service가 CI-green `main`을 검증·빌드하고 bootstrap release와 `current` 링크를 만든다. 성공한 뒤에만 서비스를 활성화한다.

```bash
systemctl start localmind-deploy.service
test -L /opt/localmind/current
systemctl is-active --quiet localmind-mcp.service
systemctl enable --now localmind-mcp.service
systemctl enable --now localmind-deploy.timer
```

## 동작 확인

```bash
systemctl start localmind-deploy.service
systemctl status localmind-deploy.service localmind-mcp.service
systemctl list-timers localmind-deploy.timer
journalctl -u localmind-deploy.service -n 100 --no-pager
cat /var/lib/localmind-deploy/last-good-sha
```

## 실패 의미

- `CI=none|failure`: 코드를 건드리지 않고 다음 timer까지 보류한다.
- tracked dirty: 운영 source repo를 보존하고 중단한다.
- test/typecheck/build 실패: current 링크와 실행 중 서비스를 변경하지 않는다.
- MCP health 실패: 이전 release 링크를 복원하고 서비스를 재시작한다.

환경 파일 및 토큰 값은 로그에 출력하지 않는다.
