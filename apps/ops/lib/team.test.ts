import { describe, expect, it } from "vitest";
import { revokeRefusal } from "./team";

const team = [
  { user_id: "me", roles: ["admin", "editor"] },
  { user_id: "other-admin", roles: ["admin"] },
  { user_id: "editor", roles: ["editor"] },
];

describe("revokeRefusal", () => {
  it("allows removing an ordinary role", () => {
    expect(revokeRefusal(team, "me", "editor", "editor")).toBeNull();
    expect(revokeRefusal(team, "me", "me", "editor")).toBeNull();
  });

  it("allows removing another admin while one remains", () => {
    expect(revokeRefusal(team, "me", "other-admin", "admin")).toBeNull();
  });

  it("never lets an admin remove their own admin role", () => {
    expect(revokeRefusal(team, "me", "me", "admin")).toMatch(/your own admin role/);
  });

  it("never leaves the team without an admin", () => {
    const solo = [
      { user_id: "me", roles: ["editor"] },
      { user_id: "last", roles: ["admin"] },
    ];
    expect(revokeRefusal(solo, "me", "last", "admin")).toMatch(/only admin/);
  });

  it("says so when the role is already gone", () => {
    expect(revokeRefusal(team, "me", "editor", "approver")).toMatch(/no longer hold/);
    expect(revokeRefusal(team, "me", "nobody", "editor")).toMatch(/no longer hold/);
  });
});
