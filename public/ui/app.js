/* specs/034 — 모니터링 UI(vanilla, 빌드리스). 판정 로직 없음 — 서버 상태의 표시만.
 * 상태 전이(design.md §3): 카드별 독립 loading→success|error|empty, 실패엔 복구 안내. */
"use strict";

const KEY_STORAGE = "localmind.ui.key";

// ── 안전한 DOM 유틸(모든 동적 텍스트는 textContent 경유 — innerHTML에 데이터 금지) ──
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    node.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}
function badge(kind, text) {
  return el("span", { class: `badge ${kind}` }, text);
}

// ── API — 401이면 KeyGate로 ─────────────────────────────────────────────
class AuthError extends Error {}
const API_TIMEOUT_MS = 30000; // 무한 스피너 금지(design.md ErrorState) — 응답 상한
async function api(path) {
  const key = localStorage.getItem(KEY_STORAGE) || "";
  let res;
  try {
    res = await fetch(`/ui/api${path}`, {
      headers: key ? { authorization: `Bearer ${key}` } : {},
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch (e) {
    if (e && e.name === "TimeoutError") {
      throw new Error("응답이 없어요(30초 초과) — UI 서버(make ui)가 살아있는지 확인하세요");
    }
    throw new Error("UI 서버에 연결할 수 없어요 — 터미널에서 make ui로 켤 수 있어요");
  }
  if (res.status === 401) throw new AuthError("인증 실패");
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message || `요청 실패(${res.status})`);
  return body;
}

// ── KeyGate ─────────────────────────────────────────────────────────────
function showKeyGate(message) {
  document.getElementById("shell").classList.add("hidden");
  const gate = document.getElementById("keygate");
  gate.classList.remove("hidden");
  const err = document.getElementById("keygate-error");
  if (message) {
    err.textContent = message;
    err.classList.remove("hidden");
  } else {
    err.classList.add("hidden");
  }
  document.getElementById("keygate-input").focus();
}
async function enterWithKey(key, { firstAttempt = false } = {}) {
  if (key) localStorage.setItem(KEY_STORAGE, key);
  try {
    await api("/config");
  } catch (e) {
    if (e instanceof AuthError) {
      // 첫 자동 진입 실패는 오류 문구 없이 게이트만(아직 입력 전이므로)
      showKeyGate(firstAttempt ? "" : "키가 맞지 않아요 — .env의 LOCALMIND_API_KEY를 확인하세요.");
      return;
    }
    // 인증은 통과했는데 다른 오류 — 페이지 카드가 표면화하므로 진입은 허용
  }
  document.getElementById("keygate").classList.add("hidden");
  document.getElementById("shell").classList.remove("hidden");
  route();
}
document.getElementById("keygate-form").addEventListener("submit", (e) => {
  e.preventDefault();
  enterWithKey(document.getElementById("keygate-input").value.trim());
});

// ── StatusCard — loading→success|error|empty(카드별 독립) ───────────────
function card(title, loader) {
  const body = el("div", {}, [el("div", { class: "skeleton" }), el("div", { class: "skeleton" })]);
  const box = el("section", { class: "card" }, [el("h3", {}, title), body]);
  (async () => {
    try {
      const content = await loader();
      body.replaceChildren(content ?? el("p", { class: "dim" }, "표시할 내용이 없어요."));
    } catch (e) {
      if (e instanceof AuthError) return showKeyGate("세션 키가 더 이상 유효하지 않아요 — 다시 입력해 주세요.");
      body.replaceChildren(
        el("div", { class: "error-state" }, [
          el("p", {}, `불러오지 못했어요: ${e.message}`),
          el("p", { class: "hint" }, "UI 서버가 정보를 읽지 못한 상태예요. 스택이 꺼져 있다면 터미널에서 make up, UI 서버는 make ui로 다시 켤 수 있어요."),
        ]),
      );
    }
  })();
  return box;
}

function table(headers, rows) {
  return el("table", {}, [
    el("thead", {}, el("tr", {}, headers.map((h) => el("th", {}, h)))),
    el("tbody", {}, rows.map((cells) => el("tr", {}, cells.map((c) => el("td", {}, c))))),
  ]);
}
function fmtTime(ms) {
  return new Date(ms).toLocaleString("ko-KR", { hour12: false });
}

// ── 페이지: 대시보드 ────────────────────────────────────────────────────
function pageDashboard() {
  const grid = el("div", { class: "grid" });

  grid.append(
    card("스택 헬스", async () => {
      const { services } = await api("/overview");
      return table(
        ["서비스", "상태"],
        services.map((s) => [s.name, s.up ? badge("ok", "정상") : badge("error", "꺼짐")]),
      );
    }),
  );

  grid.append(
    card("노트 인덱스 (파생물)", async () => {
      const idx = await api("/index");
      // 파싱 오류를 "아직 색인 전"(빈 상태)으로 위장하지 않는다 — 오류는 오류로(FR-8)
      if (idx.error) throw new Error(idx.error);
      if (!idx.indexed) {
        return el("div", {}, [
          el("p", { class: "dim" }, "아직 색인 전이에요."),
          el("p", { class: "dim" }, "터미널에서 make reindex를 실행하면 색인돼요."),
        ]);
      }
      const wrap = el("div", {});
      wrap.append(
        table(
          ["폴더", "파일", "청크"],
          idx.folders.map((f) => [f.label, String(f.files), String(f.chunks)]),
        ),
      );
      wrap.append(
        el("p", { class: "last-checked" },
          `형식 v${idx.version} · 모델 ${idx.embeddingModel ?? "?"} · 마지막 색인 ${fmtTime(idx.mtimeMs)}`),
      );
      return wrap;
    }),
  );

  grid.append(reposCard());

  grid.append(
    card("검색 품질", async () => {
      const r = await api("/reports");
      if (!r.queries) return el("p", { class: "dim" }, "아직 검색 기록이 없어요.");
      const failed = r.queries.failed;
      return el("div", {}, [
        el("div", { class: "metric" }, `${r.queries.total}건`),
        el("p", {}, ["기록된 검색 중 ", failed > 0 ? badge("warn", `실패 ${failed}건`) : badge("ok", "실패 0건")]),
        el("p", { class: "dim" }, "자세한 분석은 리포트 페이지에서."),
      ]);
    }),
  );

  return el("div", {}, [el("h2", {}, "대시보드"), grid]);
}

// 정본 카드 — 명시적 새로고침(git fetch)과 마지막 확인 시각(design.md RefreshButton)
function reposCard() {
  let refreshed = false;
  const render = async () => {
    const { repos } = await api(`/repos${refreshed ? "?refresh=1" : ""}`);
    const rows = repos.map((r) => {
      let state;
      if (r.kind === "not-git") state = badge("idle", "git 아님");
      else if (r.kind === "no-upstream") state = badge("idle", "원격 없음");
      else if (r.error) state = badge("warn", "원격 확인 불가");
      else if ((r.behind ?? 0) > 0) state = badge("warn", `${r.behind}커밋 뒤`);
      else if ((r.ahead ?? 0) > 0) state = badge("warn", `${r.ahead}커밋 앞(미푸시)`);
      else state = badge("ok", "최신");
      return [r.label, el("span", { class: "mono" }, r.dir), state];
    });
    const wrap = el("div", {});
    wrap.append(table(["정본", "경로", "상태"], rows));
    if (repos.some((r) => (r.behind ?? 0) > 0)) {
      wrap.append(el("p", { class: "dim" }, "뒤처진 정본이 있어요 — 터미널에서 make update로 최신화할 수 있어요."));
    }
    const refreshError = el("span", { class: "inline-error", role: "alert" });
    const btn = el("button", {
      class: "secondary",
      onclick: async () => {
        btn.disabled = true;
        btn.textContent = "원격 확인 중…";
        refreshError.textContent = "";
        refreshed = true;
        try {
          const fresh = await render();
          wrap.replaceWith(fresh);
        } catch (e) {
          // 실패도 상태다(design.md RefreshButton: … | error) — 무피드백 금지
          btn.disabled = false;
          btn.textContent = "원격에서 다시 확인";
          refreshError.textContent = `원격 확인 실패: ${e.message} — 표시된 값은 마지막으로 받아온 기준이에요`;
        }
      },
    }, "원격에서 다시 확인");
    wrap.append(
      el("div", { class: "card-actions" }, [
        btn,
        el("span", { class: "last-checked" },
          refreshed ? `원격 확인: ${fmtTime(Date.now())}` : "마지막으로 받아온 기준(빠름) — 버튼을 누르면 원격을 확인해요"),
        refreshError,
      ]),
    );
    return wrap;
  };
  return card("정본 최신성", render);
}

// ── 페이지: 설정(읽기 전용) ─────────────────────────────────────────────
const CONFIG_HINTS = {
  LOCALMIND_API_KEY: "바꾸려면: make token 후 .env 수정",
  LITELLM_MASTER_KEY: "바꾸려면: .env에서 비우고 make init-env",
  CLAUDE_CODE_OAUTH_TOKEN: "바꾸려면: make claude-token",
  NOTES_DIR: "바꾸려면: .env 수정 후 make mcp-install",
};

// ── specs/039 — 연결 상태 배지 + 명령 복사(읽기 전용, 웹은 실행하지 않음) ──
// 상태를 바꿀 항목: cmd(복사 가능한 정확한 명령) 또는 hint(단순 안내)
const CONNECTION_ITEMS = [
  { key: "claudeAuth", label: "Claude 구독 인증", cmd: "make claude-token" },
  { key: "claudeCodeMcp", label: "Claude Code MCP 연결", cmd: "make mcp-install" },
  { key: "claudeDesktopMcp", label: "Claude Desktop MCP 연결", cmd: "make mcp-desktop" },
  { key: "notesDir", label: "노트 폴더", cmd: "make mcp-install NOTES_DIR=/내/노트/폴더" },
  { key: "gemini", label: "백엔드: Gemini (선택)", hint: ".env에 GEMINI_API_KEY 추가 후 make up" },
  { key: "codex", label: "백엔드: codex (선택)", hint: "codex CLI 로그인(~/.codex 생성)" },
];
function statusBadge(s) {
  if (s === "ok") return badge("ok", "됨");
  if (s === "missing") return badge("warn", "안됨");
  return badge("idle", "확인 불가");
}
// 명령 chip + 복사 버튼. localhost는 보안 컨텍스트라 clipboard 가용 — 실패 시 드래그 선택 폴백.
function copyControl(cmd) {
  const chip = el("code", { class: "cmd" }, cmd);
  const live = el("span", { class: "sr-only", role: "status", "aria-live": "polite" });
  const btn = el("button", { class: "copy-btn", type: "button", "aria-label": `명령 복사: ${cmd}` }, "복사");
  btn.addEventListener("click", async () => {
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error("unsupported");
      await navigator.clipboard.writeText(cmd);
      btn.textContent = "복사됨 ✓";
      btn.classList.add("copied");
      live.textContent = "명령이 복사되었어요";
      setTimeout(() => {
        btn.textContent = "복사";
        btn.classList.remove("copied");
      }, 1500);
    } catch {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(chip);
      sel.removeAllRanges();
      sel.addRange(range);
      btn.textContent = "드래그해 복사";
      live.textContent = "직접 드래그해 복사하세요";
    }
  });
  return el("span", { class: "cmd-row" }, [chip, btn, live]);
}
function connectionsCard() {
  const render = async () => {
    const s = await api("/connections");
    const wrap = el("div", {});
    for (const it of CONNECTION_ITEMS) {
      const right = it.cmd ? copyControl(it.cmd) : el("span", { class: "dim" }, it.hint);
      wrap.append(
        el("div", { class: "setting-row" }, [
          statusBadge(s[it.key] || "unknown"),
          el("span", { class: "setting-label" }, it.label),
          right,
        ]),
      );
    }
    const btn = el("button", { class: "secondary", type: "button" }, "새로고침");
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "확인 중…";
      try {
        wrap.replaceWith(await render());
      } catch (e) {
        if (e instanceof AuthError) return showKeyGate("세션 키가 더 이상 유효하지 않아요 — 다시 입력해 주세요.");
        btn.disabled = false;
        btn.textContent = "새로고침";
      }
    });
    wrap.append(
      el("div", { class: "card-actions" }, [
        btn,
        el("span", { class: "last-checked" }, `확인: ${fmtTime(Date.now())}`),
      ]),
    );
    return wrap;
  };
  return card("연결 상태", render);
}
function guideCard() {
  return el("section", { class: "card guide-card" }, [
    el("h3", {}, "설정 바꾸는 법"),
    el("ol", { class: "guide-steps" }, [
      el("li", {}, "바꿀 항목의 [복사]를 누르세요."),
      el("li", {}, "터미널에 붙여넣어 실행하세요(어느 터미널 창이든 됩니다)."),
      el("li", {}, "이 페이지에서 [새로고침]을 누르면 상태가 갱신돼요."),
    ]),
    el("p", { class: "dim" }, "이 화면은 읽기 전용이에요 — 명령을 대신 실행하지 않습니다(안전)."),
  ]);
}
function pageConfig() {
  const grid = el("div", { class: "grid" });
  grid.append(guideCard(), connectionsCard());
  grid.append(
    card("노트 폴더 (NOTES_DIR)", async () => {
      const c = await api("/config");
      return table(
        ["라벨", "경로"],
        c.folders.map((f) => [f.label, el("span", { class: "mono" }, f.dir)]),
      );
    }),
    card("설정 값 (.env — 읽기 전용, 시크릿은 서버에서 가려져 와요)", async () => {
      const c = await api("/config");
      if (!c.exists) {
        return el("div", { class: "error-state" }, [
          el("p", {}, ".env 파일이 없어요."),
          el("p", { class: "hint" }, "터미널에서 make init-env로 만들 수 있어요."),
        ]);
      }
      return table(
        ["키", "값", "안내"],
        c.entries.map((e2) => [
          el("span", { class: "mono" }, e2.key),
          el("span", { class: "mono" }, [e2.value || "(비어 있음)", " ", e2.masked ? badge("idle", "가려짐") : ""]),
          el("span", { class: "dim" }, CONFIG_HINTS[e2.key] ?? "바꾸려면: .env 수정"),
        ]),
      );
    }),
  );
  return el("div", {}, [
    el("h2", {}, "설정"),
    el("p", { class: "dim" }, "이 화면은 읽기 전용이에요 — 변경은 각 항목의 make 명령으로."),
    grid,
  ]);
}

// ── 페이지: 에이전트 ────────────────────────────────────────────────────
function pageAgents() {
  const content = card("페르소나 레지스트리", async () => {
    const a = await api("/agents");
    if (a.personas.length === 0) {
      return el("p", { class: "dim" }, "등록된 페르소나가 없어요 — make agents-deploy가 기본 페르소나를 심어줘요.");
    }
    const wrap = el("div", {});
    wrap.append(
      table(
        ["이름", "설명", "Claude", "Codex"],
        a.personas.map((p) => [
          el("span", { class: "mono" }, p.name),
          p.description,
          p.targets.claude ? (p.deployed.claude ? badge("ok", "배포됨") : badge("warn", "미배포")) : badge("idle", "대상 아님"),
          p.targets.codex ? (p.deployed.codex ? badge("ok", "배포됨") : badge("warn", "미배포")) : badge("idle", "대상 아님"),
        ]),
      ),
    );
    if (a.personas.some((p) => (p.targets.claude && !p.deployed.claude) || (p.targets.codex && !p.deployed.codex))) {
      wrap.append(el("p", { class: "dim" }, "미배포 항목이 있어요 — 터미널에서 make agents-deploy로 배포할 수 있어요."));
    }
    if (a.problems.length > 0) {
      wrap.append(
        el("div", { class: "error-state" }, [
          el("p", {}, "정의에 문제가 있는 파일:"),
          ...a.problems.map((p) => el("p", { class: "hint" }, `${p.file}: ${p.reason}`)),
        ]),
      );
    }
    return wrap;
  });
  return el("div", {}, [el("h2", {}, "에이전트"), content]);
}

// ── 페이지: 리포트 ──────────────────────────────────────────────────────
function pageReports() {
  const viewer = el("div", {});
  const content = card("리포트", async () => {
    const r = await api("/reports");
    const wrap = el("div", {});
    if (r.queries) {
      wrap.append(el("p", {}, [`검색 기록 ${r.queries.total}건 중 `, r.queries.failed > 0 ? badge("warn", `실패 ${r.queries.failed}건`) : badge("ok", "실패 0건"), " — 자세한 분석: make query-report"]));
    } else {
      wrap.append(el("p", { class: "dim" }, "아직 검색 기록이 없어요."));
    }
    if (r.reportNotes.length === 0) {
      wrap.append(el("p", { class: "dim" }, "리포트 노트가 없어요 — make report가 주간 리포트를 만들어요."));
    } else {
      wrap.append(
        table(
          ["폴더", "노트"],
          r.reportNotes.map((n) => [
            n.label,
            el("button", {
              class: "note-link",
              onclick: async () => {
                viewer.replaceChildren(el("div", { class: "skeleton" }));
                try {
                  const note = await api(`/report-note?label=${encodeURIComponent(n.label)}&file=${encodeURIComponent(n.file)}`);
                  viewer.replaceChildren(el("pre", { class: "note-body" }, note.content));
                } catch (e) {
                  viewer.replaceChildren(el("p", { class: "error-state" }, `노트를 열지 못했어요: ${e.message}`));
                }
              },
            }, n.file),
          ]),
        ),
      );
    }
    return wrap;
  });
  return el("div", {}, [el("h2", {}, "리포트"), content, viewer]);
}

// ── 페이지: 노트 카드 브라우저(읽기 전용, specs/038) ────────────────────
function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// NoteReader — 우측 슬라이드 패널(design.md §3). 모든 텍스트 textContent(XSS 안전).
let readerPrevFocus = null; // 리더 닫을 때 포커스 복원 대상(a11y)
function onReaderEsc(e) { if (e.key === "Escape") closeReader(); }
function closeReader() {
  const o = document.getElementById("note-reader-overlay");
  if (o) o.remove();
  document.removeEventListener("keydown", onReaderEsc);
  if (readerPrevFocus && document.contains(readerPrevFocus)) readerPrevFocus.focus();
  readerPrevFocus = null;
}
function openReader(n) {
  closeReader();
  readerPrevFocus = document.activeElement; // 닫으면 열었던 카드로 포커스 복귀
  const body = el("div", { class: "reader-scroll" }, [el("div", { class: "skeleton" }), el("div", { class: "skeleton" })]);
  const closeBtn = el("button", { class: "secondary", "aria-label": "닫기", onclick: closeReader }, "✕");
  const panel = el("div", { class: "reader-panel", role: "dialog", "aria-modal": "true", "aria-label": n.title }, [
    el("div", { class: "reader-head" }, [
      el("div", { class: "reader-headmeta" }, [
        el("div", { class: "note-title" }, n.title),
        el("div", { class: "mono dim" }, n.path),
      ]),
      closeBtn,
    ]),
    body,
  ]);
  const overlay = el("div", {
    class: "reader-overlay", id: "note-reader-overlay",
    onclick: (e) => { if (e.target === overlay) closeReader(); },
  }, [panel]);
  document.body.append(overlay);
  document.addEventListener("keydown", onReaderEsc);
  closeBtn.focus(); // 패널로 포커스 이동(다이얼로그 a11y)
  (async () => {
    try {
      const note = await api(`/note?path=${encodeURIComponent(n.path)}`);
      body.replaceChildren(el("pre", { class: "note-body" }, note.content));
    } catch (e) {
      if (e instanceof AuthError) { closeReader(); return showKeyGate("세션 키가 더 이상 유효하지 않아요 — 다시 입력해 주세요."); }
      body.replaceChildren(el("p", { class: "error-state" }, `본문을 못 불러왔어요: ${e.message} — 다시 시도해 주세요.`));
    }
  })();
}

function noteCard(n) {
  const meta = el("div", { class: "note-meta" }, [badge("idle", n.folder)]);
  if (n.date) meta.append(el("span", { class: "dim" }, n.date));
  const tagEls = n.tags.slice(0, 5).map((t) => el("span", { class: "chip" }, t));
  if (n.tags.length > 5) tagEls.push(el("span", { class: "chip dim" }, `+${n.tags.length - 5}`)); // design.md §3
  return el("article", {
    class: "note-card", tabindex: "0", role: "button",
    onclick: () => openReader(n),
    onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openReader(n); } },
  }, [
    el("div", { class: "note-title" }, n.title),
    meta,
    el("div", { class: "note-snippet" }, n.snippet || "(내용 미리보기 없음)"),
    el("div", { class: "note-tags" }, tagEls),
  ]);
}

const NOTES_PAGE = 60; // 초기·증분 렌더 상한(design.md §3 대량 대응)
function renderNotes(container, notes, tags) {
  let query = "", limit = NOTES_PAGE;
  const active = new Set();

  const search = el("input", {
    type: "search", class: "note-search", placeholder: "제목·내용 검색",
    oninput: debounce((e) => { query = e.target.value.trim().toLowerCase(); limit = NOTES_PAGE; draw(); }, 200),
  });
  const count = el("span", { class: "dim note-count" });
  // "전체" 해제 칩(design.md §3) + 태그 칩. 필터 칩은 빈도 상위 24개만(벌트는 태그 수백 개 —
  // 다 뿌리면 그리드를 밀어냄. 희귀 태그는 검색으로 커버). active 비면 "전체"가 활성.
  const chipTags = tags.slice(0, 24);
  const allChip = el("button", { class: "chip filter", onclick: () => { active.clear(); syncChips(); limit = NOTES_PAGE; draw(); } }, "전체");
  const tagChips = chipTags.map((t) => el("button", {
    class: "chip filter",
    "data-tag": t,
    onclick: () => { active.has(t) ? active.delete(t) : active.add(t); syncChips(); limit = NOTES_PAGE; draw(); },
  }, t));
  const chips = el("div", { class: "note-filter-tags" }, [allChip, ...tagChips]);
  function syncChips() {
    allChip.classList.toggle("active", active.size === 0);
    for (const c of tagChips) c.classList.toggle("active", active.has(c.dataset.tag));
  }
  syncChips();
  const grid = el("div", { class: "note-grid" });
  const more = el("button", { class: "secondary note-more hidden", onclick: () => { limit += NOTES_PAGE; draw(); } });

  function filtered() {
    return notes.filter((n) => {
      if (active.size && !n.tags.some((t) => active.has(t))) return false;
      if (query) return n.title.toLowerCase().includes(query) || n.snippet.toLowerCase().includes(query);
      return true;
    });
  }
  function draw() {
    const f = filtered();
    count.textContent = `전체 ${notes.length}개 중 ${f.length}개`;
    if (f.length === 0) {
      grid.replaceChildren(el("p", { class: "dim" }, query || active.size ? "검색 결과가 없어요." : "아직 노트가 없어요."));
    } else {
      grid.replaceChildren(...f.slice(0, limit).map(noteCard));
    }
    const rest = f.length - limit;
    more.classList.toggle("hidden", rest <= 0);
    if (rest > 0) more.textContent = `더 보기 (남은 ${rest}개)`;
  }
  draw();
  container.replaceChildren(
    el("div", { class: "note-filterbar" }, [search, count, chips]),
    grid,
    more,
  );
}

function pageNotes() {
  const container = el("div", {}, [el("div", { class: "note-grid" }, Array.from({ length: 6 }, () => el("div", { class: "note-card" }, [el("div", { class: "skeleton" }), el("div", { class: "skeleton" })])))]);
  (async () => {
    try {
      const { notes, tags } = await api("/notes");
      renderNotes(container, notes, tags);
    } catch (e) {
      if (e instanceof AuthError) return showKeyGate("세션 키가 더 이상 유효하지 않아요 — 다시 입력해 주세요.");
      container.replaceChildren(el("div", { class: "error-state" }, [
        el("p", {}, `노트 목록을 못 불러왔어요: ${e.message}`),
        el("p", { class: "hint" }, "UI 서버가 노트를 읽지 못했어요 — 터미널에서 make ui로 다시 켤 수 있어요."),
      ]));
    }
  })();
  return el("div", {}, [el("h2", {}, "노트"), container]);
}

// ── 해시 라우터 ─────────────────────────────────────────────────────────
const PAGES = { dashboard: pageDashboard, config: pageConfig, agents: pageAgents, reports: pageReports, notes: pageNotes };
function route() {
  closeReader(); // 페이지 이동 시 열린 노트 리더 정리
  const name = (location.hash.replace(/^#\//, "") || "dashboard").split("?")[0];
  const page = PAGES[name] ? name : "dashboard";
  document.querySelectorAll(".sidebar nav a").forEach((a) => {
    a.classList.toggle("active", a.dataset.page === page);
  });
  document.getElementById("main").replaceChildren(PAGES[page]());
}
window.addEventListener("hashchange", route);

// ── 부팅: 저장된 키(또는 인증 꺼짐 서버면 키 없이)로 진입 시도 → 401일 때만 KeyGate ──
enterWithKey(localStorage.getItem(KEY_STORAGE) || "", { firstAttempt: true });
