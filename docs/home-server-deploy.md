# 홈서버 안전 자동 배포

홈서버는 15분마다 GitHub `main`의 새 SHA를 확인하며, 해당 SHA의 `CI`가 성공한 경우에만 release를 검증·전환한다.

## 설치

```bash
useradd --system --no-create-home --shell /usr/sbin/nologin localmind
useradd --system --no-create-home --shell /usr/sbin/nologin localmind-builder

# MCP 런타임만 지정한 노트 루트와 환경 파일을 읽고 쓸 수 있게 한다.
chgrp localmind /root
chmod 0710 /root
for d in /root/.localmind \
  /root/personal/shaul-brain/second-brain-shared \
  /root/personal/shaul-brain/second-brain-private; do
  chgrp -R localmind "$d"
  chmod -R g+rwX "$d"
  find "$d" -type d -exec chmod g+s {} +
done

install -d -m 0750 -o root -g localmind /etc/localmind
install -m 0640 -o root -g localmind .env /etc/localmind/localmind.env
install -m 0755 scripts/home-server-deploy.sh /usr/local/sbin/localmind-deploy
install -m 0644 deploy/systemd/localmind-deploy.service /etc/systemd/system/
install -m 0644 deploy/systemd/localmind-deploy.timer /etc/systemd/system/
install -m 0644 deploy/systemd/localmind-mcp.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now localmind-mcp.service
systemctl enable --now localmind-deploy.timer
```

최초에는 현재 정상 SHA를 `/opt/localmind/releases/<sha>` worktree로 준비하고, 빌드가 끝난 release를 `root:root`로 회수한 뒤 `u=rwX,go=rX`로 고정한다. `/opt/localmind/current`가 이를 가리키게 한 다음 MCP unit을 전환한다. `localmind-builder`는 candidate build 중에만 쓰기 권한을 가지며 현재·롤백 release는 수정할 수 없어야 한다.

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
