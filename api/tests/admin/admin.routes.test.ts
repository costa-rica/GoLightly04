import request from "supertest";
import { buildApp } from "../../src/app";
import { issueAccessToken } from "../../src/lib/authTokens";

const meditationModel = {
  findAll: jest.fn(),
  findByPk: jest.fn(),
  count: jest.fn(),
  update: jest.fn(),
};

const jobQueueModel = {
  findAll: jest.fn(),
  findByPk: jest.fn(),
  count: jest.fn(),
};

const userModel = {
  findAll: jest.fn(),
  findByPk: jest.fn(),
  findOrCreate: jest.fn(),
};

jest.mock("../../src/lib/db", () => ({
  getDb: () => ({
    Meditation: meditationModel,
    JobQueue: jobQueueModel,
    User: userModel,
  }),
}));

jest.mock("../../src/services/meditations/deleteMeditationCascade", () => ({
  deleteMeditationCascade: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../src/services/workerClient", () => ({
  notifyWorker: jest.fn().mockResolvedValue(undefined),
}));

describe("admin routes", () => {
  const adminToken = issueAccessToken({
    id: 1,
    email: "admin@example.com",
    isAdmin: true,
    authProvider: "local",
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("lists users with public meditation flags", async () => {
    userModel.findAll.mockResolvedValue([
      {
        id: 1,
        email: "admin@example.com",
        isEmailVerified: true,
        emailVerifiedAt: new Date("2026-04-22T00:00:00.000Z"),
        isAdmin: true,
        createdAt: new Date("2026-04-22T00:00:00.000Z"),
        updatedAt: new Date("2026-04-22T00:00:00.000Z"),
      },
    ]);
    meditationModel.findAll.mockResolvedValue([{ userId: 1 }]);

    const response = await request(buildApp())
      .get("/admin/users")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.users[0]).toMatchObject({
      id: 1,
      email: "admin@example.com",
      hasPublicMeditations: true,
    });
  });

  it("requeues a failed meditation", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    meditationModel.findByPk.mockResolvedValue({
      id: 8,
      status: "failed",
      save,
    });
    jobQueueModel.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);

    const response = await request(buildApp())
      .post("/admin/meditations/8/requeue")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.meditationId).toBe(8);
    expect(save).toHaveBeenCalled();
  });
});
