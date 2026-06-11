import request from "supertest";
import { buildApp } from "../../src/app";
import { issueAccessToken } from "../../src/lib/authTokens";
import { logger } from "../../src/config/logger";

const meditationModel = {
  findAll: jest.fn(),
  findByPk: jest.fn(),
  count: jest.fn(),
  update: jest.fn(),
};

const sequelizeMock = {
  transaction: jest.fn(async (callback: (transaction: object) => Promise<unknown>) =>
    callback({}),
  ),
};

const jobQueueModel = {
  findAll: jest.fn(),
  findByPk: jest.fn(),
  count: jest.fn(),
};

const userModel = {
  findAll: jest.fn(),
  findByPk: jest.fn(),
  findOne: jest.fn(),
};

jest.mock("../../src/lib/db", () => ({
  getDb: () => ({
    sequelize: sequelizeMock,
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

jest.mock("../../src/config/logger", () => ({
  logger: {
    error: jest.fn(),
    http: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
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

  const mockBenevolentUser = (id = 22) => {
    userModel.findOne.mockResolvedValue(
      {
        id,
        email: "benevolent_monkey@go-lightly.love",
      },
    );
  };

  const buildMeditation = (overrides: Record<string, unknown> = {}) => ({
    id: 8,
    userId: 22,
    title: "Original Title",
    description: "Original description",
    meditationArray: [{ id: 1, text: "Breathe" }],
    filename: null,
    filePath: null,
    visibility: "public",
    stage: "library",
    sourceMode: "spreadsheet",
    scriptSource: null,
    status: "complete",
    isDefault: false,
    metadata: {},
    listenCount: 3,
    durationSeconds: null,
    createdAt: new Date("2026-04-22T00:00:00.000Z"),
    updatedAt: new Date("2026-04-23T00:00:00.000Z"),
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
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

  it("lists admin meditations with serialized benevolent ownership", async () => {
    mockBenevolentUser(22);
    meditationModel.findAll.mockResolvedValue([
      buildMeditation({ id: 9, userId: 22, description: null, filePath: null }),
      buildMeditation({ id: 10, userId: 23, description: "Other" }),
    ]);

    const response = await request(buildApp())
      .get("/admin/meditations")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.meditations).toHaveLength(2);
    expect(response.body.meditations[0]).toMatchObject({
      id: 9,
      ownerUserId: 22,
      filename: "",
      isBenevolentOwned: true,
      stage: "library",
    });
    expect(response.body.meditations[0]).not.toHaveProperty("description");
    expect(response.body.meditations[0]).not.toHaveProperty("filePath");
    expect(response.body.meditations[1]).toMatchObject({
      id: 10,
      ownerUserId: 23,
      description: "Other",
      isBenevolentOwned: false,
    });
  });

  describe("PATCH /admin/meditations/:id/metadata", () => {
    const patchMetadata = () =>
      request(buildApp())
        .patch("/admin/meditations/8/metadata")
        .set("Authorization", `Bearer ${adminToken}`);

    it.each([
      {
        name: "rejects url-encoded bodies",
        request: () => patchMetadata().type("form").send("title=New+Title"),
      },
      {
        name: "rejects text bodies",
        request: () =>
          patchMetadata().set("Content-Type", "text/plain").send("title"),
      },
      {
        name: "rejects empty JSON arrays",
        request: () => patchMetadata().send([]),
      },
      {
        name: "rejects non-empty JSON arrays",
        request: () => patchMetadata().send([{ title: "New Title" }]),
      },
      {
        name: "rejects requests with no body and no content type",
        request: () => patchMetadata(),
      },
      {
        name: "rejects empty JSON bodies",
        request: () =>
          patchMetadata().set("Content-Type", "application/json").send(""),
      },
      {
        name: "rejects explicit empty objects",
        request: () => patchMetadata().send({}),
      },
    ])("$name", async ({ request: makeRequest }) => {
      const response = await makeRequest();

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(meditationModel.findByPk).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalledWith(
        "admin.benevolent_meditation_metadata_update",
        expect.anything(),
      );
    });

    it("rejects non-numeric ids before body validation", async () => {
      const response = await request(buildApp())
        .patch("/admin/meditations/not-a-number/metadata")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ title: "New Title" });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(meditationModel.findByPk).not.toHaveBeenCalled();
    });

    it("rejects unknown metadata fields", async () => {
      const response = await patchMetadata().send({
        title: "New Title",
        ownerUserId: 1,
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("UNKNOWN_FIELD");
      expect(meditationModel.findByPk).not.toHaveBeenCalled();
    });

    it("rejects invalid title, description, and visibility values", async () => {
      mockBenevolentUser(22);
      meditationModel.findByPk
        .mockResolvedValueOnce(buildMeditation())
        .mockResolvedValueOnce(buildMeditation())
        .mockResolvedValueOnce(buildMeditation());

      const emptyTitle = await patchMetadata().send({ title: "   " });
      const nonStringDescription = await patchMetadata().send({
        description: 123,
      });
      const invalidVisibility = await patchMetadata().send({
        visibility: "friends",
      });

      expect(emptyTitle.status).toBe(400);
      expect(emptyTitle.body.error.code).toBe("VALIDATION_ERROR");
      expect(nonStringDescription.status).toBe(400);
      expect(nonStringDescription.body.error.code).toBe("VALIDATION_ERROR");
      expect(invalidVisibility.status).toBe(400);
      expect(invalidVisibility.body.error.code).toBe("VALIDATION_ERROR");
      expect(logger.info).not.toHaveBeenCalledWith(
        "admin.benevolent_meditation_metadata_update",
        expect.anything(),
      );
    });

    it("warns and rejects meditations not owned by the benevolent user", async () => {
      mockBenevolentUser(22);
      meditationModel.findByPk.mockResolvedValue(buildMeditation({ userId: 44 }));

      const response = await patchMetadata().send({ title: "New Title" });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("BENEVOLENT_OWNER_REQUIRED");
      expect(logger.warn).toHaveBeenCalledWith(
        "admin.benevolent_meditation_metadata_update_rejected",
        expect.objectContaining({
          reason: "benevolent_owner_required",
          meditationId: 8,
          targetOwnerUserId: 44,
        }),
      );
      expect(logger.info).not.toHaveBeenCalledWith(
        "admin.benevolent_meditation_metadata_update",
        expect.anything(),
      );
    });

    it("warns and rejects benevolent meditations outside the library stage", async () => {
      mockBenevolentUser(22);
      meditationModel.findByPk.mockResolvedValue(buildMeditation({ stage: "staged" }));

      const response = await patchMetadata().send({ title: "New Title" });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("STAGE_NOT_ELIGIBLE");
      expect(logger.warn).toHaveBeenCalledWith(
        "admin.benevolent_meditation_metadata_update_rejected",
        expect.objectContaining({
          reason: "stage_not_eligible",
          meditationId: 8,
          stage: "staged",
        }),
      );
      expect(logger.info).not.toHaveBeenCalledWith(
        "admin.benevolent_meditation_metadata_update",
        expect.anything(),
      );
    });

    it("updates metadata, normalizes description, and writes a success audit log", async () => {
      mockBenevolentUser(22);
      const meditation = buildMeditation();
      meditationModel.findByPk.mockResolvedValue(meditation);

      const response = await patchMetadata()
        .set("User-Agent", "admin-test-agent")
        .send({
          title: "  New Title  ",
          description: "   ",
          visibility: "private",
        });

      expect(response.status).toBe(200);
      expect(meditation.save).toHaveBeenCalledTimes(1);
      expect(meditation).toMatchObject({
        title: "New Title",
        description: null,
        visibility: "private",
      });
      expect(response.body.meditation).toMatchObject({
        id: 8,
        title: "New Title",
        visibility: "private",
        isBenevolentOwned: true,
        ownerUserId: 22,
      });
      expect(response.body.meditation).not.toHaveProperty("description");

      expect(logger.info).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith(
        "admin.benevolent_meditation_metadata_update",
        expect.objectContaining({
          actorId: 1,
          actorEmail: "admin@example.com",
          actorIsAdmin: true,
          meditationId: 8,
          targetOwnerUserId: 22,
          targetOwnerEmail: "benevolent_monkey@go-lightly.love",
          previous: {
            title: "Original Title",
            description: "Original description",
            visibility: "public",
          },
          next: {
            title: "New Title",
            description: null,
            visibility: "private",
          },
          request: expect.objectContaining({
            ip: expect.any(String),
            userAgent: "admin-test-agent",
          }),
          timestamp: expect.any(String),
        }),
      );
      const [, payload] = (logger.info as jest.Mock).mock.calls[0];
      expect(Number.isNaN(Date.parse(payload.timestamp))).toBe(false);
    });

    it("supports description-only updates with trim normalization", async () => {
      mockBenevolentUser(22);
      const meditation = buildMeditation();
      meditationModel.findByPk.mockResolvedValue(meditation);

      const response = await patchMetadata().send({
        description: "  Updated description  ",
      });

      expect(response.status).toBe(200);
      expect(meditation).toMatchObject({
        title: "Original Title",
        description: "Updated description",
        visibility: "public",
      });
      expect(response.body.meditation.description).toBe("Updated description");
      expect(logger.info).toHaveBeenCalledWith(
        "admin.benevolent_meditation_metadata_update",
        expect.objectContaining({
          previous: expect.objectContaining({
            description: "Original description",
          }),
          next: expect.objectContaining({
            title: "Original Title",
            description: "Updated description",
            visibility: "public",
          }),
        }),
      );
    });
  });

  it("sets exactly one default meditation", async () => {
    mockBenevolentUser(22);
    const meditation = buildMeditation({ id: 40, isDefault: false });
    meditationModel.findByPk.mockResolvedValue(meditation);
    meditationModel.update.mockResolvedValue([3]);

    const response = await request(buildApp())
      .post("/admin/meditations/40/set-default")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(meditationModel.update).toHaveBeenCalledWith(
      { isDefault: false },
      expect.objectContaining({ where: {} }),
    );
    expect(meditation.isDefault).toBe(true);
    expect(meditation.save).toHaveBeenCalled();
    expect(response.body.meditation).toMatchObject({
      id: 40,
      isDefault: true,
    });
    expect(logger.info).toHaveBeenCalledWith(
      "admin.default_meditation_set",
      expect.objectContaining({
        actorId: 1,
        meditationId: 40,
      }),
    );
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
