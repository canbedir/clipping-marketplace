import { describe, expect, it } from "vitest";

import { parsePostUrl } from "@/lib/post-url";

describe("parsePostUrl", () => {
  it("recognises the post shapes each platform actually uses", () => {
    expect(parsePostUrl("https://www.tiktok.com/@creator/video/7234567890123456789")).toEqual({
      platform: "tiktok",
      canonicalUrl: "https://www.tiktok.com/@creator/video/7234567890123456789",
    });
    expect(parsePostUrl("https://www.instagram.com/reel/AbCdEfGhIjK/")).toEqual({
      platform: "instagram",
      canonicalUrl: "https://www.instagram.com/p/AbCdEfGhIjK/",
    });
    expect(parsePostUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toEqual({
      platform: "youtube",
      canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
  });

  it("collapses the different ways of linking one post to a single key", () => {
    const canonical = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    for (const variant of [
      "https://youtu.be/dQw4w9WgXcQ",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s",
      "https://m.youtube.com/shorts/dQw4w9WgXcQ",
    ]) {
      expect(parsePostUrl(variant)?.canonicalUrl).toBe(canonical);
    }

    expect(parsePostUrl("https://instagram.com/p/AbCdEfGhIjK")?.canonicalUrl).toBe(
      parsePostUrl("https://www.instagram.com/reel/AbCdEfGhIjK/?igsh=abc")?.canonicalUrl,
    );
  });

  it("keeps different posts apart", () => {
    expect(parsePostUrl("https://youtu.be/dQw4w9WgXcQ")?.canonicalUrl).not.toBe(
      parsePostUrl("https://youtu.be/oHg5SJYRHA0")?.canonicalUrl,
    );
  });

  it("rejects anything that is not a post on a supported platform", () => {
    for (const input of [
      "",
      "not a url",
      "javascript:alert(1)",
      "https://example.com/@creator/video/7234567890123456789",
      "https://www.tiktok.com/@creator",
      "https://www.tiktok.com/@creator/video/abc",
      "https://www.instagram.com/creator/",
      "https://www.youtube.com/watch?v=tooshort",
      "https://www.youtube.com/feed/subscriptions?v=dQw4w9WgXcQ",
    ]) {
      expect(parsePostUrl(input)).toBeNull();
    }
  });
});
