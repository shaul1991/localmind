# 홈서버 안전 자동 배포

홈서버는 15분마다 GitHub `main`의 새 SHA를 확인하며, 해당 SHA의 `CI`가 성공한 경우에만 release를 검증·전환한다.

## 설치

```bash
set -euo pipefail

install -d -m 0700 -o root -g root /var/lib/localmind-deploy
git clone git@github.com:shaul1991/localmind.git /var/lib/localmind-deploy/source
cd /var/lib/localmind-deploy/source

useradd --system --no-create-home --shell /usr/sbin/nologin localmind
useradd --system --no-create-home --shell /usr/sbin/nologin localmind-builder

# 설치 환경의 note/index/query-log 쓰기 루트를 명시한다.
NOTE_WRITE_PATHS=(
  /root/.localmind
  /root/personal/shaul-brain/second-brain-shared
  /root/personal/shaul-brain/second-brain-private
)

# MCP 런타임만 지정한 루트를 읽고 쓸 수 있게 한다.
chgrp localmind /root
chmod 0710 /root
for d in "${NOTE_WRITE_PATHS[@]}"; do
  chgrp -R localmind "$d"
  chmod -R g+rwX "$d"
  find "$d" -type d -exec chmod g+s {} +
done

install -d -m 0750 -o root -g localmind /etc/localmind
install -d -m 0755 -o root -g root /opt/localmind/releases
install -d -m 0755 -o root -g root /usr/local/libexec
install -d -m 0755 -o root -g root /etc/systemd/system/localmind-mcp.service.d
install -m 0640 -o root -g localmind .env /etc/localmind/localmind.env
install -m 0755 scripts/home-server-deploy.sh /usr/local/sbin/localmind-deploy
install -m 0755 scripts/render-systemd-write-paths.py /usr/local/libexec/localmind-render-systemd-write-paths
install -m 0644 deploy/systemd/localmind-deploy.service /etc/systemd/system/
install -m 0644 deploy/systemd/localmind-deploy.timer /etc/systemd/system/
install -m 0644 deploy/systemd/localmind-mcp.service /etc/systemd/system/
write_paths_tmp="$(mktemp)"
trap 'rm -f "$write_paths_tmp"' EXIT
/usr/local/libexec/localmind-render-systemd-write-paths "${NOTE_WRITE_PATHS[@]}" > "$write_paths_tmp"
install -m 0644 "$write_paths_tmp" /etc/systemd/system/localmind-mcp.service.d/write-paths.conf
rm -f "$write_paths_tmp"
trap - EXIT
systemctl daemon-reload
```

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
