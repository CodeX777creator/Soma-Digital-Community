import 'server-only';

import {
  createSocialAccount,
  disconnectSocialAccount,
  getSocialHubCapabilities,
  getSocialHubOverview,
  getSocialHubSummary,
  listSocialAccounts,
  listSocialProviders,
  updateSocialAccount,
  createScheduledPost,
  deleteScheduledPost,
  getContentCalendarSummary,
  listScheduledPosts,
  updateScheduledPost,
  moveScheduledPost,
} from '@/social';

export function createSocialModule() {
  return {
    accounts: {
      create: createSocialAccount,
      disconnect: disconnectSocialAccount,
      overview: getSocialHubOverview,
      summary: getSocialHubSummary,
      list: listSocialAccounts,
      providers: listSocialProviders,
      update: updateSocialAccount,
      capabilities: getSocialHubCapabilities,
    },
    calendar: {
      createScheduledPost,
      deleteScheduledPost,
      listScheduledPosts,
      updateScheduledPost,
      moveScheduledPost,
      getContentCalendarSummary,
    },
  };
}

export const socialModule = createSocialModule();

