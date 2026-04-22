describe("logger config", () => {
  const originalEnv = process.env;
  const originalExit = process.exit;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    process.exit = originalExit;
  });

  it("uses console only in development", () => {
    process.env.NODE_ENV = "development";
    process.env.NAME_APP = "LoggerTest";
    process.env.PATH_TO_LOGS = "/tmp/logger-test-dev";

    const { buildLogger, readLoggerEnv } = require("../../src/config/logger");
    const logger = buildLogger(readLoggerEnv(process.env));

    expect(logger.transports).toHaveLength(1);
    expect(logger.transports[0].constructor.name).toBe("Console");
  });

  it("uses console and file in testing", () => {
    process.env.NODE_ENV = "testing";
    process.env.NAME_APP = "LoggerTest";
    process.env.PATH_TO_LOGS = "/tmp/logger-test-testing";

    const { buildLogger, readLoggerEnv } = require("../../src/config/logger");
    const logger = buildLogger(readLoggerEnv(process.env));

    expect(logger.transports).toHaveLength(2);
  });

  it("exits on missing required env", () => {
    const exitSpy = jest.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    delete process.env.NAME_APP;
    process.env.NODE_ENV = "testing";
    process.env.PATH_TO_LOGS = "/tmp/logger-test-missing";

    expect(() => {
      require("../../src/config/logger").readLoggerEnv(process.env);
    }).toThrow("exit:1");

    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
