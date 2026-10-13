import { describe, expect, it } from "vitest";
import { QUIET_FOR, pickIdea, timeAgo } from "./resurface";
import type { DocumentSummary } from "../core/storage";

const now = 1_000 * QUIET_FOR;
const day = 24 * 60 * 60 * 1000;

function summary(id: string, updatedAt: number, extra: Partial<DocumentSummary> = {}): DocumentSummary {
  return { id, title: id, createdAt: 0, updatedAt, revision: 1, root: null, released: false, restUntil: 0, project: null, kind: "file", parent: null, label: "", color: null, unread: false, trashedAt: 0, ...extra };
}

describe("pickIdea", () => {
  it("picks the idea that has been quiet the longest", () => {
    const ideas = [summary("recent", now - day), summary("old", now - 60 * day), summary("middle", now - 20 * day)];
    expect(pickIdea(ideas, now, [])?.id).toBe("old");
  });

  it("never picks released, resting, recent or open ideas", () => {
    const ideas = [
      summary("released", now - 90 * day, { released: true }),
      summary("resting", now - 90 * day, { restUntil: now + day }),
      summary("recent", now - 2 * day),
      summary("open", now - 90 * day),
    ];
    expect(pickIdea(ideas, now, ["open"])).toBeNull();
  });
});

describe("timeAgo", () => {
  it("speaks in human units", () => {
    expect(timeAgo(now - 9 * day, now)).toBe("9 days ago");
    expect(timeAgo(now - 21 * day, now)).toBe("3 weeks ago");
    expect(timeAgo(now - 95 * day, now)).toBe("3 months ago");
    expect(timeAgo(now - 1 * day, now)).toBe("1 day ago");
  });
});
