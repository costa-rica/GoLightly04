import request from "supertest";
import { buildApp } from "../../src/app";

describe("app smoke", () => {
  it("returns healthz", async () => {
    const app = buildApp();
    const response = await request(app).get("/healthz");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });
});
