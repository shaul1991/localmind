import { createHash, randomUUID } from "node:crypto";
import {
  closeSync, constants, fstatSync, fsyncSync, linkSync, lstatSync, openSync,
  opendirSync, readFileSync, readSync, unlinkSync, writeSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const SCHEMA = "localmind.evidence-cadence.v1";
const SAFE_ID = /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/;
const SHA256 = /^[a-f0-9]{64}$/;
const TRIGGERS = new Set(["user_request", "quality_regression", "reliability_failure", "scheduled_maintenance"]);
const BASE_INPUT_KEYS = ["goal_id", "phase", "iteration", "action", "trigger", "recorded_at"];
const INPUT_KEYS = {
  proposed: new Set([
    ...BASE_INPUT_KEYS, "classification", "metric_id", "before_value", "sample_size",
    "hypothesis_sha256", "reproduction_sha256", "fixture_sha256", "stop_condition_sha256",
  ]),
  implementation_started: new Set([...BASE_INPUT_KEYS, "proposal_sha256", "authorization_sha256"]),
  validated: new Set([
    ...BASE_INPUT_KEYS, "proposal_sha256", "validation_sha256", "lesson_sha256",
    "residual_risk_sha256", "after_value", "after_sample_size", "supersedes_event_sha256",
  ]),
  rejected: new Set([
    ...BASE_INPUT_KEYS, "proposal_sha256", "validation_sha256", "lesson_sha256", "residual_risk_sha256",
  ]),
  maintained: new Set([...BASE_INPUT_KEYS, "decision_sha256", "validation_sha256"]),
  assumption_revalidated: new Set([...BASE_INPUT_KEYS, "decision_sha256", "validation_sha256"]),
};
const EVENT_METADATA_KEYS = new Set(["schema", "sequence", "previous_event_sha256", "event_sha256"]);

function rejectInvalidInput() {
  throw new Error("cadence input invalid");
}

function rejectInvalidTransition() {
  throw new Error("cadence transition invalid");
}

function hasExactKeys(value, keys) {
  const actual = Object.keys(value);
  return actual.length === keys.size && actual.every((key) => keys.has(key));
}

function isSafeId(value) {
  return typeof value === "string" && SAFE_ID.test(value);
}

function isSha256(value) {
  return typeof value === "string" && SHA256.test(value);
}

function isCanonicalTime(value) {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function validateInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) rejectInvalidInput();
  if (typeof input.action !== "string" || !Object.hasOwn(INPUT_KEYS, input.action)) rejectInvalidInput();
  const allowed = INPUT_KEYS[input.action];
  if (!allowed || !hasExactKeys(input, allowed)) rejectInvalidInput();
  if (!isSafeId(input.goal_id) || !TRIGGERS.has(input.trigger) || !isCanonicalTime(input.recorded_at)) rejectInvalidInput();
  if (!Number.isInteger(input.iteration) || input.iteration < 1 || input.iteration > 5) rejectInvalidInput();

  const maintenance = input.action === "maintained" || input.action === "assumption_revalidated";
  if (maintenance ? input.phase !== "maintain" : (input.phase !== "bootstrap" && input.phase !== "iterate")) rejectInvalidInput();

  if (input.action === "proposed") {
    if (input.classification !== "implementation_candidate" || !isSafeId(input.metric_id)) rejectInvalidInput();
    if (!Number.isFinite(input.before_value) || Object.is(input.before_value, -0)) rejectInvalidInput();
    if (!Number.isInteger(input.sample_size) || input.sample_size < 1 || input.sample_size > 1_000_000_000) rejectInvalidInput();
    for (const key of ["hypothesis_sha256", "reproduction_sha256", "fixture_sha256", "stop_condition_sha256"]) {
      if (!isSha256(input[key])) rejectInvalidInput();
    }
  } else if (input.action === "implementation_started") {
    if (!isSha256(input.proposal_sha256) || !isSha256(input.authorization_sha256)) rejectInvalidInput();
  } else if (input.action === "validated") {
    if (!isSha256(input.proposal_sha256) || !isSha256(input.validation_sha256)
      || !isSha256(input.lesson_sha256) || !isSha256(input.residual_risk_sha256)) rejectInvalidInput();
    if (!Number.isFinite(input.after_value) || Object.is(input.after_value, -0)) rejectInvalidInput();
    if (!Number.isInteger(input.after_sample_size)
      || input.after_sample_size < 1 || input.after_sample_size > 1_000_000_000) rejectInvalidInput();
    if (input.supersedes_event_sha256 !== null && !isSha256(input.supersedes_event_sha256)) rejectInvalidInput();
  } else if (input.action === "rejected") {
    if (!isSha256(input.proposal_sha256) || !isSha256(input.validation_sha256)
      || !isSha256(input.lesson_sha256) || !isSha256(input.residual_risk_sha256)) rejectInvalidInput();
  } else if (!isSha256(input.decision_sha256) || !isSha256(input.validation_sha256)) {
    rejectInvalidInput();
  }
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function eventDigest(event) {
  const payload = { ...event };
  delete payload.event_sha256;
  return createHash("sha256").update(JSON.stringify(canonical(payload))).digest("hex");
}

function inputFromEvent(event) {
  return Object.fromEntries(Object.entries(event).filter(([key]) => !EVENT_METADATA_KEYS.has(key)));
}

export function validateEvidenceHistory(history) {
  if (!Array.isArray(history) || history.length > 500) throw new Error("cadence history invalid");
  let previous = null;
  let previousTime = null;
  let activeWip = 0;
  const goals = new Map();
  const actionCounts = {};

  for (let index = 0; index < history.length; index++) {
    const event = history[index];
    if (!event || typeof event !== "object" || Array.isArray(event)) throw new Error("cadence event invalid");
    validateInput(inputFromEvent(event));
    if (event.schema !== SCHEMA || event.sequence !== index + 1) throw new Error("cadence sequence invalid");
    if (event.previous_event_sha256 !== previous) throw new Error("cadence chain invalid");
    if (event.event_sha256 !== eventDigest(event)) throw new Error("cadence digest invalid");
    if (previousTime !== null && event.recorded_at < previousTime) rejectInvalidTransition();

    const state = goals.get(event.goal_id);
    if (event.action === "proposed") {
      if (!state) {
        if (event.iteration !== 1 || event.phase !== "bootstrap") rejectInvalidTransition();
        goals.set(event.goal_id, {
          iteration: 1,
          status: "proposed",
          proposal_sha256: event.event_sha256,
          phase: event.phase,
          trigger: event.trigger,
          current_decision_sha256: null,
        });
      } else {
        if ((state.status !== "validated" && state.status !== "rejected")
          || event.iteration !== state.iteration + 1 || event.phase !== "iterate") rejectInvalidTransition();
        goals.set(event.goal_id, {
          ...state,
          iteration: event.iteration,
          status: "proposed",
          proposal_sha256: event.event_sha256,
          phase: event.phase,
          trigger: event.trigger,
        });
      }
    } else if (event.action === "implementation_started") {
      if (!state || state.status !== "proposed" || activeWip !== 0) rejectInvalidTransition();
      if (event.iteration !== state.iteration || event.phase !== state.phase || event.trigger !== state.trigger) rejectInvalidTransition();
      if (event.proposal_sha256 !== state.proposal_sha256) rejectInvalidTransition();
      state.status = "implementation_started";
      activeWip = 1;
    } else if (event.action === "validated") {
      if (!state || state.status !== "implementation_started" || activeWip !== 1) rejectInvalidTransition();
      if (event.iteration !== state.iteration || event.phase !== state.phase || event.trigger !== state.trigger) rejectInvalidTransition();
      if (event.proposal_sha256 !== state.proposal_sha256 || event.supersedes_event_sha256 !== state.current_decision_sha256) rejectInvalidTransition();
      state.status = "validated";
      state.current_decision_sha256 = event.event_sha256;
      activeWip = 0;
    } else if (event.action === "rejected") {
      if (!state || state.status !== "implementation_started" || activeWip !== 1) rejectInvalidTransition();
      if (event.iteration !== state.iteration || event.phase !== state.phase || event.trigger !== state.trigger) rejectInvalidTransition();
      if (event.proposal_sha256 !== state.proposal_sha256) rejectInvalidTransition();
      state.status = "rejected";
      activeWip = 0;
    } else {
      if (!state || (state.status !== "validated" && state.status !== "rejected")
        || activeWip !== 0 || state.current_decision_sha256 === null) rejectInvalidTransition();
      if (event.phase !== "maintain" || event.iteration !== state.iteration) rejectInvalidTransition();
      if (event.decision_sha256 !== state.current_decision_sha256) rejectInvalidTransition();
    }

    actionCounts[event.action] = (actionCounts[event.action] ?? 0) + 1;
    previous = event.event_sha256;
    previousTime = event.recorded_at;
  }

  return {
    events: history.length,
    goals: goals.size,
    active_wip: activeWip,
    latest_sequence: history.length,
    head_sha256: previous,
    action_counts: actionCounts,
  };
}

export function buildEvidenceEvent(history, input) {
  validateEvidenceHistory(history);
  validateInput(input);
  const event = {
    ...input,
    schema: SCHEMA,
    sequence: history.length + 1,
    previous_event_sha256: history.at(-1)?.event_sha256 ?? null,
  };
  event.event_sha256 = eventDigest(event);
  validateEvidenceHistory([...history, event]);
  return event;
}

function rejectInvalidStorage() {
  throw new Error("cadence storage invalid");
}

function assertLedgerDirectory(directory) {
  if (typeof directory !== "string" || directory.length === 0) rejectInvalidStorage();
  let stat;
  try {
    stat = lstatSync(directory);
  } catch {
    rejectInvalidStorage();
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) rejectInvalidStorage();
}

function readSegment(path) {
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size < 2 || stat.size > 32_768) rejectInvalidStorage();
    const text = readFileSync(descriptor, "utf8");
    const event = JSON.parse(text);
    if (!event || typeof event !== "object" || Array.isArray(event)) rejectInvalidStorage();
    if (text !== `${JSON.stringify(canonical(event))}\n`) rejectInvalidStorage();
    return event;
  } catch (error) {
    if (error?.message === "cadence storage invalid") throw error;
    rejectInvalidStorage();
  } finally {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { /* stable public error already selected */ }
    }
  }
}

export function readEvidenceDirectory(directory) {
  assertLedgerDirectory(directory);
  const names = [];
  let handle;
  let enumerationFailed = false;
  try {
    handle = opendirSync(directory);
    while (true) {
      const entry = handle.readSync();
      if (entry === null) break;
      names.push(entry.name);
      if (names.length > 500) rejectInvalidStorage();
    }
  } catch {
    enumerationFailed = true;
  } finally {
    if (handle !== undefined) {
      try { handle.closeSync(); } catch { enumerationFailed = true; }
    }
  }
  if (enumerationFailed) rejectInvalidStorage();
  names.sort();
  if (names.some((name) => !/^\d{6}\.json$/.test(name))) rejectInvalidStorage();
  const history = names.map((name, index) => {
    if (name !== `${String(index + 1).padStart(6, "0")}.json`) rejectInvalidStorage();
    const path = join(directory, name);
    let stat;
    try { stat = lstatSync(path); } catch { rejectInvalidStorage(); }
    if (stat.isSymbolicLink() || !stat.isFile()) rejectInvalidStorage();
    return readSegment(path);
  });
  validateEvidenceHistory(history);
  return history;
}

function writeFully(descriptor, buffer) {
  let offset = 0;
  while (offset < buffer.length) {
    const written = writeSync(descriptor, buffer, offset, buffer.length - offset);
    if (written <= 0) throw new Error("cadence storage unavailable");
    offset += written;
  }
}

export function appendEvidenceEvent(directory, input) {
  const history = readEvidenceDirectory(directory);
  const event = buildEvidenceEvent(history, input);
  const finalPath = join(directory, `${String(event.sequence).padStart(6, "0")}.json`);
  const temporaryPath = join(dirname(directory), `.${basename(directory)}.cadence-${randomUUID()}.tmp`);
  let descriptor;
  let published = false;
  let temporaryExists = false;
  try {
    descriptor = openSync(
      temporaryPath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    temporaryExists = true;
    writeFully(descriptor, Buffer.from(`${JSON.stringify(canonical(event))}\n`, "utf8"));
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    linkSync(temporaryPath, finalPath);
    published = true;
    unlinkSync(temporaryPath);
    temporaryExists = false;
    const directoryDescriptor = openSync(
      directory,
      constants.O_RDONLY | (constants.O_DIRECTORY ?? 0) | (constants.O_NOFOLLOW ?? 0),
    );
    try { fsyncSync(directoryDescriptor); } finally { closeSync(directoryDescriptor); }
    const parentDescriptor = openSync(
      dirname(directory),
      constants.O_RDONLY | (constants.O_DIRECTORY ?? 0) | (constants.O_NOFOLLOW ?? 0),
    );
    try { fsyncSync(parentDescriptor); } finally { closeSync(parentDescriptor); }
    return event;
  } catch (error) {
    if (error?.message === "cadence input invalid" || error?.message === "cadence transition invalid") throw error;
    if (error?.code === "EEXIST") throw new Error("cadence append conflict");
    throw new Error(published ? "cadence durability unknown" : "cadence storage unavailable");
  } finally {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { /* stable public error already selected */ }
    }
    if (temporaryExists) {
      try { unlinkSync(temporaryPath); } catch { /* operation already failed closed */ }
    }
  }
}

function readStdinJson() {
  const chunks = [];
  let total = 0;
  while (true) {
    const buffer = Buffer.allocUnsafe(4096);
    const read = readSync(0, buffer, 0, buffer.length, null);
    if (read === 0) break;
    total += read;
    if (total > 32_768) rejectInvalidInput();
    chunks.push(buffer.subarray(0, read));
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks, total).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) rejectInvalidInput();
    return value;
  } catch (error) {
    if (error?.message === "cadence input invalid") throw error;
    rejectInvalidInput();
  }
}

function runCli() {
  const [command, directory, ...extra] = process.argv.slice(2);
  if (extra.length !== 0 || (command !== "append" && command !== "verify") || !directory) rejectInvalidInput();
  if (command === "append") {
    const event = appendEvidenceEvent(directory, readStdinJson());
    process.stdout.write(`${JSON.stringify({ sequence: event.sequence, event_sha256: event.event_sha256 })}\n`);
    return;
  }
  const summary = validateEvidenceHistory(readEvidenceDirectory(directory));
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    runCli();
  } catch {
    process.stderr.write("cadence rejected\n");
    process.exitCode = 2;
  }
}
