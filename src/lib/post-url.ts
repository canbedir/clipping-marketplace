import type { Platform } from "@/lib/constants";

export type ParsedPostUrl = {
  platform: Platform;
  canonicalUrl: string;
};

const TIKTOK_HOSTS = new Set(["tiktok.com", "www.tiktok.com", "m.tiktok.com"]);
const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com"]);
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "www.youtu.be",
]);

const TIKTOK_PATH = /^\/@([a-z0-9._]{1,24})\/video\/(\d{6,25})$/;
const INSTAGRAM_PATH = /^\/(?:p|reel|reels)\/([A-Za-z0-9_-]{5,32})$/;
const YOUTUBE_PATH = /^\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{11})$/;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

export function parsePostUrl(input: string): ParsedPostUrl | null {
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > 2048) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const host = url.hostname.toLowerCase();
  const path = url.pathname.replace(/\/+$/, "");

  if (TIKTOK_HOSTS.has(host)) {
    const match = TIKTOK_PATH.exec(path.toLowerCase());
    if (!match) return null;
    return {
      platform: "tiktok",
      canonicalUrl: `https://www.tiktok.com/@${match[1]}/video/${match[2]}`,
    };
  }

  if (INSTAGRAM_HOSTS.has(host)) {
    const match = INSTAGRAM_PATH.exec(path);
    if (!match) return null;
    return {
      platform: "instagram",
      canonicalUrl: `https://www.instagram.com/p/${match[1]}/`,
    };
  }

  if (YOUTUBE_HOSTS.has(host)) {
    const id = host.endsWith("youtu.be")
      ? path.slice(1)
      : (YOUTUBE_PATH.exec(path)?.[1] ??
        (path === "/watch" ? (url.searchParams.get("v") ?? "") : ""));
    if (!YOUTUBE_ID.test(id)) return null;
    return {
      platform: "youtube",
      canonicalUrl: `https://www.youtube.com/watch?v=${id}`,
    };
  }

  return null;
}
