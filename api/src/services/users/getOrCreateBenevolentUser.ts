import { getDb } from "../../lib/db";

export const BENEVOLENT_USER_EMAIL = "benevolent.system@golightly.local";

export async function getOrCreateBenevolentUser() {
  const { User } = getDb();
  const [user] = await User.findOrCreate({
    where: { email: BENEVOLENT_USER_EMAIL },
    defaults: {
      email: BENEVOLENT_USER_EMAIL,
      password: null,
      authProvider: "local",
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
      isAdmin: false,
    },
  });
  return user;
}
