/** The Ops team and its roles (O21). Pure, so the rules about who can lose what are tested. */

export const OPS_ROLES = [
  "researcher",
  "reviewer",
  "verifier",
  "editor",
  "approver",
  "translator",
  "media",
  "support",
  "admin",
] as const;

export type OpsRoleName = (typeof OPS_ROLES)[number];

/** PRD F18's role table, in the words an admin granting one needs. */
export const ROLE_SUMMARY: Record<OpsRoleName, string> = {
  researcher: "Creates drafts and runs ingestion",
  reviewer: "Works the Review queue",
  verifier: "Verifies fields and settles conflicts",
  editor: "Edits any draft and restores versions",
  approver: "Approves and publishes",
  translator: "Edits locale content only",
  media: "Manages media only",
  support: "Works reports; reads everything else",
  admin: "Everything, including the team and flags",
};

export type TeamMember = { user_id: string; roles: readonly string[] };

/**
 * Why a role cannot be taken away, or null when it can. An admin never removes their own
 * admin role, and the team is never left without one — either would lock everybody out of
 * this screen with nobody able to put it right.
 */
export function revokeRefusal(
  team: readonly TeamMember[],
  actorId: string,
  userId: string,
  role: string,
): string | null {
  const member = team.find((m) => m.user_id === userId);
  if (!member || !member.roles.includes(role)) return "They no longer hold that role.";

  if (role === "admin") {
    if (userId === actorId) {
      return "You can't remove your own admin role. Another admin has to do that.";
    }
    if (team.filter((m) => m.roles.includes("admin")).length <= 1) {
      return "This is the only admin. Make somebody else an admin first.";
    }
  }
  return null;
}
