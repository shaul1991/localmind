type Level = "debug" | "info" | "warn" | "error";

const ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

let current: Level = "info";

export function setLogLevel(level: Level): void {
  current = level;
}

function emit(level: Level, args: unknown[]): void {
  if (ORDER[level] < ORDER[current]) return;
  const ts = new Date().toISOString();
  const prefix = `[${ts}] ${level.toUpperCase()}`;
  // eslint-disable-next-line no-console
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  fn(prefix, ...args);
}

export const log = {
  debug: (...a: unknown[]) => emit("debug", a),
  info: (...a: unknown[]) => emit("info", a),
  warn: (...a: unknown[]) => emit("warn", a),
  error: (...a: unknown[]) => emit("error", a),
};
