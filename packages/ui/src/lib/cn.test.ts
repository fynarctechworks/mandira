import { describe, expect, it } from "vitest";

import { buttonVariants } from "../components/button";
import { cn } from "./cn";

describe("cn", () => {
  it("keeps a text colour and a type-scale size together", () => {
    expect(cn("text-text-on-primary", "text-body").split(" ")).toEqual(
      expect.arrayContaining(["text-text-on-primary", "text-body"]),
    );
  });

  it("still lets a later size replace an earlier one", () => {
    expect(cn("text-body", "text-caption")).toBe("text-caption");
  });

  it("gives every primary button its on-primary text colour", () => {
    const classes = buttonVariants({ variant: "primary", size: "default" }).split(" ");
    expect(classes).toContain("text-text-on-primary");
    expect(classes).toContain("text-body");
  });
});
