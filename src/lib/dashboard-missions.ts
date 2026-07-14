export type DashboardMissionTemplate = {
  title: string;
  description: string;
  xpReward: number;
};

export const DASHBOARD_MISSION_TEMPLATES: DashboardMissionTemplate[] = [
  { title: 'Post in community', description: 'Share an update or question in the community.', xpReward: 30 },
  { title: 'Chat with AI mentor', description: 'Ask the AI mentor for personalized advice.', xpReward: 40 },
  { title: 'Schedule content', description: 'Add one post to your social scheduler.', xpReward: 35 },
];

export function getDashboardMissionDateString(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
