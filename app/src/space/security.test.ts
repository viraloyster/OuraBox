import { describe, expect, it } from "vitest";
import { shouldAutolock } from "./security";

describe("shouldAutolock", () => {
  const minute = 60_000;

  it("locks once the inactive time is reached", () => {
    expect(shouldAutolock(15 * minute, 0, 15)).toBe(true);
    expect(shouldAutolock(15 * minute - 1, 0, 15)).toBe(false);
  });

  it("counts time while the computer was asleep", () => {
    expect(shouldAutolock(8 * 60 * minute, 0, 15)).toBe(true);
  });

  it("never locks when set to never", () => {
    expect(shouldAutolock(1000 * minute, 0, 0)).toBe(false);
  });
});
