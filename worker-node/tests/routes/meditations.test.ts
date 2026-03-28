import request from "supertest";

describe("POST /meditations/new", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.NODE_ENV = "testing";
    process.env.PATH_TO_LOGS = "./tmp/test-logs";
  });

  it("returns a successful workflow response", async () => {
    const orchestrateMeditationCreation = jest.fn(async () => ({
      success: true,
      queueId: 42,
      finalFilePath: "/tmp/final.mp3",
    }));

    jest.doMock("../../src/modules/logger", () => ({
      __esModule: true,
      default: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      },
    }));
    jest.doMock("../../src/modules/workflowOrchestrator", () => ({
      orchestrateMeditationCreation,
    }));

    const { buildApp } = await import("../../src/app");
    const app = buildApp();

    const response = await request(app).post("/meditations/new").send({
      userId: 1,
      meditationArray: [{ id: "1", text: "hello there" }],
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      queueId: 42,
      finalFilePath: "/tmp/final.mp3",
      message: "Meditation created successfully",
    });
    expect(orchestrateMeditationCreation).toHaveBeenCalledWith({
      userId: 1,
      meditationArray: [{ id: "1", text: "hello there" }],
    });
  });

  it("returns a validation error for an invalid request body", async () => {
    jest.doMock("../../src/modules/logger", () => ({
      __esModule: true,
      default: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      },
    }));

    const { buildApp } = await import("../../src/app");
    const app = buildApp();

    const response = await request(app).post("/meditations/new").send({
      userId: 1,
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.message).toBe(
      "Either filenameCsv or meditationArray must be provided",
    );
  });

  it("returns a workflow failure payload when orchestration fails", async () => {
    jest.doMock("../../src/modules/logger", () => ({
      __esModule: true,
      default: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      },
    }));
    jest.doMock("../../src/modules/workflowOrchestrator", () => ({
      orchestrateMeditationCreation: jest.fn(async () => ({
        success: false,
        queueId: 77,
        error: "workflow failed",
      })),
    }));

    const { buildApp } = await import("../../src/app");
    const app = buildApp();

    const response = await request(app).post("/meditations/new").send({
      userId: 1,
      meditationArray: [{ id: "1", text: "hello there" }],
    });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: false,
      queueId: 77,
      error: {
        code: "WORKFLOW_FAILED",
        message: "workflow failed",
        status: 500,
      },
    });
  });
});
