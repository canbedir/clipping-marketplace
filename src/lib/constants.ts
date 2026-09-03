export const PLATFORMS = ["tiktok", "instagram", "youtube"] as const;
export const CAMPAIGN_STATUSES = ["draft", "active", "paused", "completed"] as const;
export const SUBMISSION_STATUSES = ["pending", "approved", "rejected", "paid"] as const;
export const USER_ROLES = ["admin", "creator"] as const;

export type Platform = (typeof PLATFORMS)[number];
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];
export type UserRole = (typeof USER_ROLES)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
};

export const PLATFORM_URL_HINTS: Record<Platform, string> = {
  tiktok: "https://www.tiktok.com/@handle/video/1234567890123456789",
  instagram: "https://www.instagram.com/reel/AbCdEfGhIjK/",
  youtube: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
};
