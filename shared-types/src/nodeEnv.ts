export type RuntimeNodeEnv = "development" | "testing" | "production";

export function normalizeNodeEnv(value: string | undefined): RuntimeNodeEnv {
  const normalized = value === "test" ? "testing" : value;
  if (
    normalized !== "development" &&
    normalized !== "testing" &&
    normalized !== "production"
  ) {
    throw new Error("NODE_ENV must be one of development, testing, production");
  }

  return normalized;
}
