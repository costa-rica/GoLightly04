describe("worker logger config", () => {
  const originalEnv = process.env;
  const originalExit = process.exit;
  const originalStderrWrite = process.stderr.write;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    process.exit = originalExit;
    process.stderr.write = originalStderrWrite;
    jest.restoreAllMocks();
  });

  function validEnv(overrides: Record<string, string | undefined> = {}) {
    return {
      NODE_ENV: "testing",
      NAME_APP: "worker-node-tests",
      PATH_TO_LOGS: "/tmp/worker-node-logger-tests",
      ...overrides,
    };
  }

  function mockExit() {
    const stderrSpy = jest
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const exitSpy = jest.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    return { exitSpy, stderrSpy };
  }

  it("uses numeric defaults for optional log retention env", () => {
    const { readLoggerEnv } = require("../../src/config/logger");

    expect(readLoggerEnv(validEnv())).toMatchObject({
      LOG_MAX_SIZE: 5,
      LOG_MAX_FILES: 5,
    });
  });

  it("parses numeric log retention env", () => {
    const { readLoggerEnv } = require("../../src/config/logger");

    expect(
      readLoggerEnv(validEnv({ LOG_MAX_SIZE: "5", LOG_MAX_FILES: "7" })),
    ).toMatchObject({
      LOG_MAX_SIZE: 5,
      LOG_MAX_FILES: 7,
    });
  });

  it.each([
    ["LOG_MAX_SIZE", "10m"],
    ["LOG_MAX_FILES", "10m"],
    ["LOG_MAX_SIZE", "14d"],
    ["LOG_MAX_FILES", "3d"],
    ["LOG_MAX_SIZE", "abc"],
    ["LOG_MAX_FILES", "abc"],
    ["LOG_MAX_SIZE", "0"],
    ["LOG_MAX_FILES", "-1"],
  ] as const)("exits when %s is %s", (name, value) => {
    const { exitSpy, stderrSpy } = mockExit();
    const { readLoggerEnv } = require("../../src/config/logger");

    expect(() => readLoggerEnv(validEnv({ [name]: value }))).toThrow("exit:1");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining(`Missing or invalid env var: ${name}`),
    );
  });

  it.each([
    ["development", "development"],
    ["testing", "testing"],
    ["production", "production"],
    ["test", "testing"],
  ] as const)("normalizes NODE_ENV %s", (raw, expected) => {
    const { readLoggerEnv } = require("../../src/config/logger");

    expect(readLoggerEnv(validEnv({ NODE_ENV: raw })).NODE_ENV).toBe(expected);
  });

  it("exits when NODE_ENV is invalid", () => {
    const { exitSpy, stderrSpy } = mockExit();
    const { readLoggerEnv } = require("../../src/config/logger");

    expect(() => readLoggerEnv(validEnv({ NODE_ENV: "staging" }))).toThrow("exit:1");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("NODE_ENV must be one of development, testing, production"),
    );
  });

  it("exits when NODE_ENV is missing", () => {
    const { exitSpy, stderrSpy } = mockExit();
    const { readLoggerEnv } = require("../../src/config/logger");

    expect(() => readLoggerEnv(validEnv({ NODE_ENV: undefined }))).toThrow("exit:1");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("Missing required env var: NODE_ENV"),
    );
  });

  it.each(["NAME_APP", "PATH_TO_LOGS"] as const)("exits when %s is missing", (name) => {
    const { exitSpy, stderrSpy } = mockExit();
    const { readLoggerEnv } = require("../../src/config/logger");

    expect(() => readLoggerEnv(validEnv({ [name]: undefined }))).toThrow("exit:1");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining(`Missing required env var: ${name}`),
    );
  });

  it("uses console only in development", () => {
    const { buildLogger, readLoggerEnv } = require("../../src/config/logger");
    const logger = buildLogger(readLoggerEnv(validEnv({ NODE_ENV: "development" })));

    expect(logger.transports).toHaveLength(1);
    expect(logger.transports[0].constructor.name).toBe("Console");
  });

  it("uses console and file in testing", () => {
    const { buildLogger, readLoggerEnv } = require("../../src/config/logger");
    const logger = buildLogger(readLoggerEnv(validEnv({ NODE_ENV: "testing" })));

    expect(logger.transports).toHaveLength(2);
  });

  it("uses file only in production", () => {
    const { buildLogger, readLoggerEnv } = require("../../src/config/logger");
    const logger = buildLogger(readLoggerEnv(validEnv({ NODE_ENV: "production" })));

    expect(logger.transports).toHaveLength(1);
    expect(logger.transports[0].constructor.name).not.toBe("Console");
  });
});
