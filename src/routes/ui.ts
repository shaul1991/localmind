/**
 * specs/034 — 모니터링 UI 상태 API(interface 레이어, read-only).
 * 요청 → ui-status 수집기 호출 → JSON. 판정 로직 없음(전부 수집기 소관).
 * 어떤 핸들러도 뮤테이션하지 않는다 — 1차 범위는 모니터링 전용(goal Non-goals).
 */
import { Router, type Request, type Response } from "express";
import { listNotesWithMeta } from "../brain.js";
import { readConnections } from "../connection-status.js";
import {
  agentsStatus,
  configStatus,
  indexStatus,
  overviewStatus,
  readNoteContent,
  readReportNote,
  reportsStatus,
  reposStatus,
  type RepoTarget,
  type ServiceProbe,
} from "../ui-status.js";

export interface UiDeps {
  /** localmind 프로젝트 루트(코드 정본 repo) */
  projectDir: string;
  envFile: string;
  /** NOTES_DIR 노트 폴더(라벨 포함) */
  folders: RepoTarget[];
  indexPath: string;
  queryLogPath: string;
  registryDir?: string;
  claudeAgentsDir?: string;
  codexHome?: string;
  /** 스택 헬스 프로브 대상(make health와 동일 3종) */
  services: ServiceProbe[];
  /** 정적 UI 폴더(public/ui) */
  publicDir: string;
}

function wrap(fn: (req: Request) => Promise<unknown> | unknown) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      res.json(await fn(req));
    } catch (e) {
      res.status(500).json({
        error: { message: `상태를 읽지 못했어요: ${(e as Error).message}`, type: "ui_status_error" },
      });
    }
  };
}

export function createUiRouter(deps: UiDeps): Router {
  const r = Router();

  r.get("/overview", wrap(async () => ({ services: await overviewStatus(deps.services) })));
  r.get("/index", wrap(() => indexStatus(deps.indexPath)));
  r.get(
    "/repos",
    wrap(async (req) => ({
      refreshed: req.query.refresh === "1",
      repos: await reposStatus(
        [{ label: "localmind (코드)", dir: deps.projectDir }, ...deps.folders],
        { refresh: req.query.refresh === "1" },
      ),
    })),
  );
  r.get("/config", wrap(() => ({ ...configStatus(deps.envFile), folders: deps.folders })));
  // specs/039 — 연결 상태(읽기 전용): 각 설정이 ok|missing|unknown. 시크릿 값은 반환 안 함.
  r.get(
    "/connections",
    wrap(() =>
      readConnections({ envFile: deps.envFile, folders: deps.folders, codexHome: deps.codexHome }),
    ),
  );
  r.get(
    "/agents",
    wrap(() =>
      agentsStatus({
        registryDir: deps.registryDir,
        claudeAgentsDir: deps.claudeAgentsDir,
        codexHome: deps.codexHome,
      }),
    ),
  );
  r.get("/reports", wrap(() => reportsStatus(deps.queryLogPath, deps.folders)));
  r.get("/report-note", (req, res) => {
    const label = String(req.query.label ?? "");
    const file = String(req.query.file ?? "");
    const note = readReportNote(deps.folders, label, file);
    if (note.ok) res.json({ content: note.content });
    else res.status(400).json({ error: { message: note.reason, type: "invalid_request_error" } });
  });

  // specs/038 — 노트 카드 브라우저(read-only)
  r.get("/notes", wrap(() => listNotesWithMeta()));
  r.get("/note", (req, res) => {
    const note = readNoteContent(deps.folders, String(req.query.path ?? ""));
    if (note.ok) res.json({ content: note.content });
    else res.status(400).json({ error: { message: note.reason, type: "invalid_request_error" } });
  });

  r.use((_req, res) => {
    res.status(404).json({ error: { message: "없는 API 경로예요.", type: "not_found" } });
  });
  return r;
}
