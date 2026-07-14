export type XPActionKey =
  | "daily_login"
  | "onboarding_complete"
  | "growth_assessment_complete"
  | "community_post_created"
  | "community_comment_created"
  | "community_reply_created"
  | "mission_completed";

export type XPEventType =
  | "mission"
  | "post"
  | "comment"
  | "reply"
  | "mentor"
  | "profile"
  | "login"
  | "streak"
  | "other";

export type XPPolicyRule = {
  action: XPActionKey;
  eventType: XPEventType;
  xp: number;
  idempotency: "global" | "daily" | "resource";
  dailyCap?: number;
  notification?: {
    type: "mission" | "welcome";
    title: string;
    body: (xp: number) => string;
    linkUrl: string;
  };
};

export const XP_POLICY: Record<XPActionKey, XPPolicyRule> = {
  daily_login: {
    action: "daily_login",
    eventType: "login",
    xp: 5,
    idempotency: "daily",
  },
  onboarding_complete: {
    action: "onboarding_complete",
    eventType: "profile",
    xp: 25,
    idempotency: "global",
    notification: {
      type: "welcome",
      title: "Welcome to Soma Digital",
      body: () => "Your account is ready. Start your first mission from the dashboard.",
      linkUrl: "/dashboard",
    },
  },
  growth_assessment_complete: {
    action: "growth_assessment_complete",
    eventType: "profile",
    xp: 20,
    idempotency: "global",
  },
  community_post_created: {
    action: "community_post_created",
    eventType: "post",
    xp: 15,
    idempotency: "resource",
    dailyCap: 150,
  },
  community_comment_created: {
    action: "community_comment_created",
    eventType: "comment",
    xp: 5,
    idempotency: "resource",
    dailyCap: 75,
  },
  community_reply_created: {
    action: "community_reply_created",
    eventType: "reply",
    xp: 3,
    idempotency: "resource",
    dailyCap: 60,
  },
  mission_completed: {
    action: "mission_completed",
    eventType: "mission",
    xp: 0,
    idempotency: "resource",
    notification: {
      type: "mission",
      title: "Mission completed",
      body: (xp) => `You earned ${xp} XP for completing a mission.`,
      linkUrl: "/dashboard",
    },
  },
};

export function getXPPolicy(action: XPActionKey) {
  return XP_POLICY[action];
}

export function isXPActionKey(value: unknown): value is XPActionKey {
  return typeof value === "string" && value in XP_POLICY;
}
