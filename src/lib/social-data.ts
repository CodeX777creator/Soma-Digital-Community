import type { SocialPlatform, SocialProviderDefinition } from "@/social/types";

export const SOCIAL_PROVIDER_REGISTRY: SocialProviderDefinition[] = [
  {
    id: "tiktok",
    label: "TikTok",
    description: "Short-form video publishing and account metadata.",
    connectLabel: "Connect TikTok",
    notes: "Video Direct Post, Draft Inbox, and photo publishing require approved TikTok Content Posting API access.",
  },
  {
    id: "instagram",
    label: "Instagram",
    description: "Instagram creator and business account connections.",
    connectLabel: "Connect Instagram",
    notes: "Instagram Professional accounts can publish feed media, Reels, Stories, and carousels through the selected Meta login path.",
  },
  {
    id: "facebook",
    label: "Facebook",
    description: "Facebook page and business account connections.",
    connectLabel: "Connect Facebook",
    notes: "Facebook Page publishing uses a Page access token and the selected Page destination.",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    description: "Professional brand account connections.",
    connectLabel: "Connect LinkedIn",
    notes: "Supports member posts by default; organization publishing requires the organization scope and an eligible Page role.",
  },
  {
    id: "x",
    label: "X",
    description: "Fast social distribution and public commentary.",
    connectLabel: "Connect X",
    notes: "Text publishing uses X API v2 user-context OAuth; media requires separately uploaded X media IDs.",
  },
  {
    id: "youtube",
    label: "YouTube",
    description: "Long-form video channel connections.",
    connectLabel: "Connect YouTube",
    notes: "Uploads use YouTube Data API resumable upload sessions and remain processing until YouTube confirms availability.",
  },
];

export function getSocialProvider(providerId: SocialPlatform): SocialProviderDefinition {
  const provider = SOCIAL_PROVIDER_REGISTRY.find((entry) => entry.id === providerId);
  if (!provider) {
    throw new Error(`Unsupported social provider: ${providerId}`);
  }

  return provider;
}
