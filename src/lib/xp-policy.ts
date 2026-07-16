export type XPActionKey =
  | "daily_login"
  | "onboarding_complete"
  | "growth_assessment_complete"
  | "community_post_created"
  | "community_comment_created"
  | "community_reply_created"
  | "mission_completed"
  | "academy_lesson_completed"
  | "academy_activity_submitted"
  | "academy_activity_approved"
  | "academy_topic_completed"
  | "academy_quiz_passed"
  | "academy_live_session_attended"
  | "academy_course_completed"
  | "academy_certificate_earned";

export type XPEventType =
  | "mission"
  | "post"
  | "comment"
  | "reply"
  | "mentor"
  | "academy"
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
  academy_lesson_completed: {
    action: "academy_lesson_completed",
    eventType: "academy",
    xp: 10,
    idempotency: "resource",
    dailyCap: 120,
  },
  academy_activity_submitted: {
    action: "academy_activity_submitted",
    eventType: "academy",
    xp: 10,
    idempotency: "resource",
    dailyCap: 120,
  },
  academy_activity_approved: {
    action: "academy_activity_approved",
    eventType: "academy",
    xp: 20,
    idempotency: "resource",
    dailyCap: 160,
    notification: {
      type: "mission",
      title: "Academy activity approved",
      body: (xp) => `Your activity was approved and you earned ${xp} XP.`,
      linkUrl: "/academy",
    },
  },
  academy_topic_completed: {
    action: "academy_topic_completed",
    eventType: "academy",
    xp: 25,
    idempotency: "resource",
    dailyCap: 150,
  },
  academy_quiz_passed: {
    action: "academy_quiz_passed",
    eventType: "academy",
    xp: 30,
    idempotency: "resource",
    notification: {
      type: "mission",
      title: "Academy quiz passed",
      body: (xp) => `Great work. You passed a topic quiz and earned ${xp} XP.`,
      linkUrl: "/academy",
    },
  },
  academy_live_session_attended: {
    action: "academy_live_session_attended",
    eventType: "academy",
    xp: 20,
    idempotency: "resource",
    dailyCap: 100,
  },
  academy_course_completed: {
    action: "academy_course_completed",
    eventType: "academy",
    xp: 100,
    idempotency: "resource",
    notification: {
      type: "mission",
      title: "Academy course completed",
      body: (xp) => `You completed an Academy course and earned ${xp} XP.`,
      linkUrl: "/academy",
    },
  },
  academy_certificate_earned: {
    action: "academy_certificate_earned",
    eventType: "academy",
    xp: 150,
    idempotency: "resource",
    notification: {
      type: "mission",
      title: "Certificate earned",
      body: (xp) => `Your certificate is ready. You earned ${xp} XP.`,
      linkUrl: "/academy/certificates",
    },
  },
};

export function getXPPolicy(action: XPActionKey) {
  return XP_POLICY[action];
}

export function isXPActionKey(value: unknown): value is XPActionKey {
  return typeof value === "string" && value in XP_POLICY;
}
