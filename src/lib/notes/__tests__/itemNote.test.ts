import { describe, expect, it } from "vitest";
import { cleanNote, hasQuickNote, toggleQuickNote } from "../itemNote";

describe("item notes", () => {
  it("adds a quick note to what was typed, and takes it back off", () => {
    const added = toggleQuickNote("extra plate", "No onion");
    expect(added).toBe("extra plate, No onion");
    expect(hasQuickNote(added, "no onion")).toBe(true);
    expect(toggleQuickNote(added, "No onion")).toBe("extra plate");
  });

  it("saves nothing for a blank note", () => {
    expect(cleanNote("   ")).toBeUndefined();
    expect(cleanNote("  No ice ")).toBe("No ice");
  });
});
