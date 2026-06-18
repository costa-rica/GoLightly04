import { col, fn, Op, UniqueConstraintError, where as sequelizeWhere } from "sequelize";

export const USERNAME_PATTERN = /^[a-z0-9._-]{3,30}$/;
export const USERNAME_MAX_LENGTH = 30;
const USERNAME_RETRY_CAP = 100000;

type UserModelLike = {
  findOne: (options: any) => Promise<any>;
  create: (values: Record<string, unknown>) => Promise<any>;
};

export function normalizeSubmittedUsername(value: string): string | null {
  const username = value.trim().toLowerCase();
  return USERNAME_PATTERN.test(username) ? username : null;
}

export function usernameBaseFromEmail(email: string): string {
  let base = email.split("@")[0].trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
  if (!base) {
    base = "user";
  }
  while (base.length < 3) {
    base += "user";
  }
  return base.slice(0, USERNAME_MAX_LENGTH);
}

export function usernameCandidate(base: string, suffixNumber: number): string {
  const suffix = suffixNumber === 1 ? "" : String(suffixNumber);
  return `${base.slice(0, USERNAME_MAX_LENGTH - suffix.length)}${suffix}`;
}

function usernameWhere(username: string, excludeUserId?: number) {
  const lowerMatch = sequelizeWhere(fn("lower", col("username")), username.toLowerCase());
  if (excludeUserId === undefined) {
    return lowerMatch;
  }
  return {
    [Op.and]: [lowerMatch, { id: { [Op.ne]: excludeUserId } }],
  };
}

export async function isUsernameTaken(
  User: Pick<UserModelLike, "findOne">,
  username: string,
  excludeUserId?: number,
): Promise<boolean> {
  const existing = await User.findOne({ where: usernameWhere(username, excludeUserId) });
  return Boolean(existing);
}

export async function allocateUniqueUsernameFromEmail(
  User: Pick<UserModelLike, "findOne">,
  email: string,
  startSuffixNumber = 1,
): Promise<{ username: string; suffixNumber: number }> {
  const base = usernameBaseFromEmail(email);
  for (let suffixNumber = startSuffixNumber; suffixNumber <= USERNAME_RETRY_CAP; suffixNumber += 1) {
    const username = usernameCandidate(base, suffixNumber);
    if (!(await isUsernameTaken(User, username))) {
      return { username, suffixNumber };
    }
  }

  throw new Error(`Unable to allocate username for ${email} after ${USERNAME_RETRY_CAP} attempts`);
}

export async function createUserWithUniqueUsername(
  User: UserModelLike,
  values: Record<string, unknown> & { email: string },
): Promise<any> {
  let nextSuffixNumber = 1;
  for (let attempt = 1; attempt <= USERNAME_RETRY_CAP; attempt += 1) {
    const { username, suffixNumber } = await allocateUniqueUsernameFromEmail(
      User,
      values.email,
      nextSuffixNumber,
    );
    try {
      return await User.create({ ...values, username });
    } catch (error) {
      if (!isUsernameUniqueConstraintError(error)) {
        throw error;
      }
      nextSuffixNumber = suffixNumber + 1;
    }
  }

  throw new Error(`Unable to create unique username for ${values.email} after ${USERNAME_RETRY_CAP} attempts`);
}

function uniqueErrorParts(error: UniqueConstraintError) {
  const fields = Object.keys((error as { fields?: Record<string, unknown> }).fields ?? {}).map((value) => value.toLowerCase());
  const paths = error.errors.map((item) => item.path?.toLowerCase()).filter(Boolean) as string[];
  const parent = error.parent as { constraint?: string; detail?: string } | undefined;
  return {
    fields,
    paths,
    constraint: parent?.constraint?.toLowerCase() ?? "",
    detail: parent?.detail?.toLowerCase() ?? "",
  };
}

export function isUsernameUniqueConstraintError(error: unknown): boolean {
  if (!(error instanceof UniqueConstraintError)) return false;
  const parts = uniqueErrorParts(error);
  return (
    parts.fields.includes("username") ||
    parts.paths.includes("username") ||
    parts.constraint === "users_username_lower_idx" ||
    parts.detail.startsWith("key (username)=") ||
    parts.detail.startsWith("key (lower(username))=")
  );
}

export function isEmailUniqueConstraintError(error: unknown): boolean {
  if (!(error instanceof UniqueConstraintError)) return false;
  const parts = uniqueErrorParts(error);
  return (
    parts.fields.includes("email") ||
    parts.paths.includes("email") ||
    parts.constraint.includes("email") ||
    parts.detail.startsWith("key (email)=")
  );
}
