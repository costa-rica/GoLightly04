import { applyApiTestEnv } from "../helpers/testEnv";

const createMockResponse = () => {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };

  return response;
};

describe("API smoke tests", () => {
  beforeEach(() => {
    jest.resetModules();
    applyApiTestEnv();
  });

  test("GET /health returns service status", async () => {
    const { buildApp } = await import("../../src/app");
    const app = buildApp();
    const healthLayer = app._router.stack.find(
      (layer: any) => layer.route?.path === "/health" && layer.route.methods.get,
    );
    const response = createMockResponse();

    expect(healthLayer).toBeDefined();

    await healthLayer.route.stack[0].handle({}, response);

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
      service: "GoLightly03API",
    });
  });

  test("unknown routes return the standard 404 contract", async () => {
    const { notFoundHandler } = await import("../../src/modules/errorHandler");
    const response = createMockResponse();

    notFoundHandler(
      { method: "GET", path: "/does-not-exist" } as any,
      response as any,
    );

    expect(response.statusCode).toBe(404);
    expect(response.body).toMatchObject({
      error: {
        code: "NOT_FOUND",
        status: 404,
      },
    });
  });
});
