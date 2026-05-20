import { normalizeNodeEnv } from "../src/nodeEnv";

describe("normalizeNodeEnv", () => {
  it.each([
    ["development", "development"],
    ["testing", "testing"],
    ["production", "production"],
    ["test", "testing"],
  ] as const)("normalizes %s to %s", (input, expected) => {
    expect(normalizeNodeEnv(input)).toBe(expected);
  });

  it.each(["", undefined, "staging"] as const)("rejects %s", (input) => {
    expect(() => normalizeNodeEnv(input)).toThrow(
      "NODE_ENV must be one of development, testing, production",
    );
  });
});
