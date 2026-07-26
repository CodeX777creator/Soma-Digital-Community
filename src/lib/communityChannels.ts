export const COMMUNITY_CHANNELS = [
  { id: "all", label: "All" },
  { id: "general", label: "General" },
  { id: "introduction", label: "Introduction" },
  { id: "showcase", label: "Showcase" },
  { id: "questions", label: "Questions" },
  { id: "jobs", label: "Jobs" },
  { id: "ai-mentor", label: "AI Mentor" },
] as const;

export type CommunityChannel = (typeof COMMUNITY_CHANNELS)[number]["id"];
export type PostChannel = Exclude<CommunityChannel, "all">;

export const POST_CHANNELS = [
  { id: "general", label: "General" },
  { id: "introduction", label: "Introduction" },
  { id: "showcase", label: "Showcase" },
  { id: "questions", label: "Questions" },
  { id: "jobs", label: "Jobs" },
  { id: "ai-mentor", label: "AI Mentor" },
] as const satisfies readonly { id: PostChannel; label: string }[];

export const DEFAULT_POST_CHANNEL: PostChannel = "general";

export function isPostChannel(value: unknown): value is PostChannel {
  return POST_CHANNELS.some((channel) => channel.id === value);
}

export function getChannelLabel(channelId: string): string {
  return COMMUNITY_CHANNELS.find((channel) => channel.id === channelId)?.label || "General";
}
