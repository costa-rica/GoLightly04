import { getDb } from "../../lib/db";

export const BENEVOLENT_USER_EMAIL = "benevolent_monkey@go-lightly.love";

export async function findBenevolentUser() {
  const { User } = getDb();
  return User.findOne({ where: { email: BENEVOLENT_USER_EMAIL } });
}
