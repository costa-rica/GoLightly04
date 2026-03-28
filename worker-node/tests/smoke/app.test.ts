import request from "supertest";

describe("worker-node app", () => {
  it("returns health status without booting startup flow", async () => {
    process.env.NODE_ENV = "testing";
    process.env.PATH_TO_LOGS = "./tmp/test-logs";

    // Import after test env setup so logger initialization uses the test config.
    const { buildApp } = await import("../../src/app");
    const app = buildApp();

    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", service: "GoLightly03WorkerNode" });
  });
});
