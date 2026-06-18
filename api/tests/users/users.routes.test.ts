import request from "supertest";
import { UniqueConstraintError } from "sequelize";

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

function usernameUniqueError(): UniqueConstraintError {
  const error = new UniqueConstraintError({ errors: [] }) as UniqueConstraintError & {
    fields: Record<string, unknown>;
    parent: { constraint: string; name: string; message: string; sql: string; detail?: string };
  };
  error.fields = { username: "nick" };
  error.parent = { constraint: "users_username_lower_idx", name: "", message: "", sql: "" };
  return error;
}

function emailUniqueError(email = "username@example.com"): UniqueConstraintError {
  const error = new UniqueConstraintError({ errors: [] }) as UniqueConstraintError & {
    fields: Record<string, unknown>;
    parent: { constraint: string; name: string; message: string; sql: string; detail: string };
  };
  error.fields = { email };
  error.parent = {
    constraint: "users_email_key",
    detail: `Key (email)=(${email}) already exists.`,
    name: "",
    message: "",
    sql: "",
  };
  return error;
}

describe("users routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    userModel.findOne.mockReset();
    userModel.create.mockReset();
    meditationModel.count.mockReset();
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
    expect(userModel.create).toHaveBeenCalledWith(expect.objectContaining({ username: "user" }));
  });

  it("registers username collisions with base, base2, base3 convention", async () => {
    userModel.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 1, username: "nick" })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 1, username: "nick" })
      .mockResolvedValueOnce({ id: 2, username: "nick2" })
      .mockResolvedValueOnce(null);
    userModel.create
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce({ id: 2 })
      .mockResolvedValueOnce({ id: 3 });

    const app = buildApp();
    await request(app).post("/users/register").send({ email: "nick@example.com", password: "password123" });
    await request(app).post("/users/register").send({ email: "nick@other.com", password: "password123" });
    await request(app).post("/users/register").send({ email: "nick@third.com", password: "password123" });

    expect(userModel.create.mock.calls.map((call) => call[0].username)).toEqual(["nick", "nick2", "nick3"]);
  });

  it("retries register username allocation after a unique race using the next suffix", async () => {
    userModel.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    userModel.create
      .mockRejectedValueOnce(usernameUniqueError())
      .mockResolvedValueOnce({ id: 8 });

    const response = await request(buildApp()).post("/users/register").send({
      email: "nick@example.com",
      password: "password123",
    });

    expect(response.status).toBe(201);
    expect(userModel.create.mock.calls.map((call) => call[0].username)).toEqual(["nick", "nick2"]);
  });

  it("does not retry register when the unique race is for email", async () => {
    userModel.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    userModel.create.mockRejectedValueOnce(emailUniqueError("username@example.com"));

    const response = await request(buildApp()).post("/users/register").send({
      email: "username@example.com",
      password: "password123",
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("EMAIL_EXISTS");
    expect(userModel.create).toHaveBeenCalledTimes(1);
  });

  it("logs in a verified local user", async () => {
    userModel.findOne.mockResolvedValue({
      id: 5,
      email: "user@example.com",
      username: "user",
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
      username: "user",
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
      username: "user",
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
        username: "user",
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
      username: "user",
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
      username: "user",
      isAdmin: false,
      authProvider: "local",
      showScriptModeForCreatingMeditations: true,
      hasPublicMeditations: false,
    });
  });

  it("updates the authenticated user's username", async () => {
    const user = {
      id: 5,
      email: "user@example.com",
      username: "old_name",
      isAdmin: false,
      authProvider: "local",
      showScriptModeForCreatingMeditations: false,
      save: jest.fn().mockResolvedValue(undefined),
    };
    userModel.findOne.mockResolvedValueOnce(user).mockResolvedValueOnce(null);

    const response = await request(buildApp())
      .patch("/users/me/username")
      .set("Authorization", `Bearer ${makeAccessToken()}`)
      .send({ username: " New.Name-123 " });

    expect(response.status).toBe(200);
    expect(user.username).toBe("new.name-123");
    expect(response.body.user.username).toBe("new.name-123");
  });

  it("rejects invalid username updates", async () => {
    const response = await request(buildApp())
      .patch("/users/me/username")
      .set("Authorization", `Bearer ${makeAccessToken()}`)
      .send({ username: "no spaces" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 409 for taken username updates", async () => {
    const user = {
      id: 5,
      email: "user@example.com",
      username: "old_name",
      isAdmin: false,
      authProvider: "local",
      showScriptModeForCreatingMeditations: false,
      save: jest.fn().mockResolvedValue(undefined),
    };
    userModel.findOne
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce({ id: 6, username: "taken" });

    const response = await request(buildApp())
      .patch("/users/me/username")
      .set("Authorization", `Bearer ${makeAccessToken()}`)
      .send({ username: "taken" });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("USERNAME_TAKEN");
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
      username: "user",
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

  it("assigns a username for new Google users", async () => {
    userModel.findOne.mockResolvedValue(null);
    userModel.create.mockResolvedValue({
      id: 9,
      email: "google@example.com",
      username: "google",
      isAdmin: false,
      authProvider: "google",
      showScriptModeForCreatingMeditations: false,
    });

    const response = await request(buildApp()).post("/users/google-auth").send({ idToken: "token" });

    expect(response.status).toBe(200);
    expect(userModel.create).toHaveBeenCalledWith(expect.objectContaining({ username: "google" }));
    expect(response.body.user.username).toBe("google");
  });

  it("does not overwrite existing Google user usernames", async () => {
    const existing = {
      id: 9,
      email: "google@example.com",
      username: "custom",
      isAdmin: false,
      authProvider: "google",
      showScriptModeForCreatingMeditations: false,
    };
    userModel.findOne.mockResolvedValue(existing);

    const response = await request(buildApp()).post("/users/google-auth").send({ idToken: "token" });

    expect(response.status).toBe(200);
    expect(userModel.create).not.toHaveBeenCalled();
    expect(response.body.user.username).toBe("custom");
  });
});
