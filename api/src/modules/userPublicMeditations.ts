import { ContractUsersMeditations, Meditation } from "@golightly/db-models";
import { Op } from "sequelize";

/**
 * Check if a user has any public meditations
 *
 * @param userId - The user ID to check
 * @returns Promise<boolean> - true if user has at least one public meditation, false otherwise
 */
export async function checkUserHasPublicMeditations(
  userId: number,
): Promise<boolean> {
  // Find all meditation IDs connected to this user
  const userMeditations = await ContractUsersMeditations.findAll({
    where: { userId },
    attributes: ["meditationId"],
  });

  // If user has no meditations, return false
  if (userMeditations.length === 0) {
    return false;
  }

  // Extract meditation IDs
  const meditationIds = userMeditations.map(
    (contract) => contract.get("meditationId") as number,
  );

  // Check if any of these meditations have visibility='public'
  const publicMeditationCount = await Meditation.count({
    where: {
      id: {
        [Op.in]: meditationIds,
      },
      visibility: "public",
    },
  });

  return publicMeditationCount > 0;
}
