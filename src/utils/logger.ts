type LogLevel = "debug" | "info" | "warn" | "error";

const levelWeights: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const currentLevel = () => process.env.LOG_LEVEL ?? "info";

const shouldLog = (level: LogLevel) =>
  levelWeights[level] >= (levelWeights[currentLevel() as LogLevel] ?? 20);

const basePayload = (namespace: string, level: LogLevel) => ({
  namespace,
  level,
  timestamp: new Date().toISOString()
});

const normalizePayload = (payload?: unknown): Record<string, unknown> => {
  if (!payload) {
    return {};
  }

  if (payload instanceof Error) {
    return {
      name: payload.name,
      message: payload.message,
      stack: payload.stack
    };
  }

  if (typeof payload === "object") {
    return payload as Record<string, unknown>;
  }

  return { value: payload };
};

export const createLogger = (namespace: string) => ({
  debug(message: string, payload?: unknown) {
    if (!shouldLog("debug")) return;
    console.debug(message, {
      ...basePayload(namespace, "debug"),
      ...normalizePayload(payload)
    });
  },
  info(message: string, payload?: unknown) {
    if (!shouldLog("info")) return;
    console.info(message, {
      ...basePayload(namespace, "info"),
      ...normalizePayload(payload)
    });
  },
  warn(message: string, payload?: unknown) {
    if (!shouldLog("warn")) return;
    console.warn(message, {
      ...basePayload(namespace, "warn"),
      ...normalizePayload(payload)
    });
  },
  error(message: string, payload?: unknown) {
    if (!shouldLog("error")) return;
    console.error(message, {
      ...basePayload(namespace, "error"),
      ...normalizePayload(payload)
    });
  }
});
