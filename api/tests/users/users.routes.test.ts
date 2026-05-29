import request from "supertest";

const userModel = {
  findOne: jest.fn(),
  create: jest.fn(),
};

const meditationModel = {
  count: jest.fn(),
};

jest.mock("../../src/lib/db", () => ({
  getDb: () => ({
    User: userModel,
    Meditation: meditationModel,
  }),
}));

jest.mock("../../src/services/email", () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("bcrypt", () => ({
  hash: jest.fn().mockResolvedValue("hashed-password"),
  compare: jest.fn().mockResolvedValue(true),
}));

jest.mock("google-auth-library", () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: jest.fn().mockResolvedValue({
      getPayload: () => ({ email: "google@example.com" }),
    }),
  })),
}));

import { buildApp } from "../../src/app";
import { issueAccessToken } from "../../src/lib/authTokens";

function makeAccessToken(user = { id: 5, email: "user@example.com", isAdmin: false, authProvider: "local" as const }) {
  return issueAccessToken(user);
}

describe("users routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    meditationModel.count.mockResolvedValue(0);
  });

  it("registers a user", async () => {
    userModel.findOne.mockResolvedValue(null);
    userModel.create.mockResolvedValue({ id: 7 });

    const app = buildApp();
    const response = await request(app).post("/users/register").send({
      email: "user@example.com",
      password: "password123",
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      message: "Registration successful",
      userId: 7,
    });
    expect(userModel.create).toHaveBeenCalled();
  });

  it("logs in a verified local user", async () => {
    userModel.findOne.mockResolvedValue({
      id: 5,
      email: "user@example.com",
      password: "hashed-password",
      isEmailVerified: true,
      isAdmin: false,
      authProvider: "local",
    });

    const app = buildApp();
    const response = await request(app).post("/users/login").send({
      email: "user@example.com",
      password: "password123",
    });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Login successful");
    expect(response.body.user).toMatchObject({
      id: 5,
      email: "user@example.com",
      isAdmin: false,
      authProvider: "local",
      showScriptModeForCreatingMeditations: false,
      hasPublicMeditations: false,
    });
    expect(response.body.accessToken).toEqual(expect.any(String));
  });

  it("gets the authenticated user profile and preference", async () => {
    userModel.findOne.mockResolvedValue({
      id: 5,
      email: "user@example.com",
      password: "hashed-password",
      isEmailVerified: true,
      isAdmin: false,
      authProvider: "local",
      showScriptModeForCreatingMeditations: true,
    });
    meditationModel.count.mockResolvedValue(1);

    const app = buildApp();
    const response = await request(app)
      .get("/users/me")
      .set("Authorization", `Bearer ${makeAccessToken()}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      user: {
        id: 5,
        email: "user@example.com",
        isAdmin: false,
        authProvider: "local",
        showScriptModeForCreatingMeditations: true,
        hasPublicMeditations: true,
      },
    });
  });

  it("returns 404 when authenticated profile user is missing", async () => {
    userModel.findOne.mockResolvedValue(null);

    const app = buildApp();
    const response = await request(app)
      .get("/users/me")
      .set("Authorization", `Bearer ${makeAccessToken()}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("USER_NOT_FOUND");
  });

  it("updates the authenticated user's create mode preference", async () => {
    const user = {
      id: 5,
      email: "user@example.com",
      password: "hashed-password",
      isEmailVerified: true,
      isAdmin: false,
      authProvider: "local",
      showScriptModeForCreatingMeditations: false,
      save: jest.fn().mockResolvedValue(undefined),
    };
    userModel.findOne.mockResolvedValue(user);

    const app = buildApp();
    const response = await request(app)
      .patch("/users/me/preferences")
      .set("Authorization", `Bearer ${makeAccessToken()}`)
      .send({ showScriptModeForCreatingMeditations: true });

    expect(response.status).toBe(200);
    expect(user.showScriptModeForCreatingMeditations).toBe(true);
    expect(user.save).toHaveBeenCalled();
    expect(response.body.user).toMatchObject({
      id: 5,
      email: "user@example.com",
      isAdmin: false,
      authProvider: "local",
      showScriptModeForCreatingMeditations: true,
      hasPublicMeditations: false,
    });
  });

  it("rejects non-boolean create mode preference updates", async () => {
    const app = buildApp();
    const response = await request(app)
      .patch("/users/me/preferences")
      .set("Authorization", `Bearer ${makeAccessToken()}`)
      .send({ showScriptModeForCreatingMeditations: "true" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(userModel.findOne).not.toHaveBeenCalled();
  });

  it("requires authentication for profile endpoints", async () => {
    const app = buildApp();

    const getResponse = await request(app).get("/users/me");
    const patchResponse = await request(app)
      .patch("/users/me/preferences")
      .send({ showScriptModeForCreatingMeditations: true });

    expect(getResponse.status).toBe(401);
    expect(getResponse.body.error.code).toBe("AUTH_REQUIRED");
    expect(patchResponse.status).toBe(401);
    expect(patchResponse.body.error.code).toBe("AUTH_REQUIRED");
  });

  it("rejects login when email is not verified", async () => {
    userModel.findOne.mockResolvedValue({
      id: 5,
      email: "user@example.com",
      password: "hashed-password",
      isEmailVerified: false,
      isAdmin: false,
      authProvider: "local",
    });

    const app = buildApp();
    const response = await request(app).post("/users/login").send({
      email: "user@example.com",
      password: "password123",
    });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("EMAIL_NOT_VERIFIED");
  });
});
