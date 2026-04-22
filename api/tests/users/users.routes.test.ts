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
      hasPublicMeditations: false,
    });
    expect(response.body.accessToken).toEqual(expect.any(String));
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
