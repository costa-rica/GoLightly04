import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

// Hash password using bcrypt
export const hashPassword = async (password: string): Promise<string> => {
  return await bcrypt.hash(password, SALT_ROUNDS);
};

// Compare password with hash
export const comparePassword = async (
  password: string,
  hash: string
): Promise<boolean> => {
  return await bcrypt.compare(password, hash);
};
