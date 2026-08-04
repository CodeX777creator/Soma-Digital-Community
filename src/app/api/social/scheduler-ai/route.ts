import { NextRequest } from 'next/server';
import { requireSubscription } from '@/lib/serverAuth';
import { getTierPrivileges } from '@/lib/tier-privileges';
import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { adminDb } from '@/lib/firebaseAdmin';
import { normalizeDate } from '@/lib/date-utils';
import { sanitizeString } from '@/lib/security';
import { generateStudioContent } from '@/ai/studio';
import {
  listScheduledPosts,
  listSocialAccounts,
  listSocialPostAnalytics,
  type ScheduledPostRecord,
  type SocialAccountRecord,
  type SocialPlatform,
} from '@/social';
import type { StudioContentType } from '@/ai/studio/types';

const ACTIONS = [
  'generate_todays_content',
  'adapt_instagram',
  'shorten_x',
  'generate_hashtags',
  'suggest_best_time',
  'fill_content_gap',
  'repurpose_video_captions',
  'create_7_day_campaign',
] as const;

type SchedulerAIAction = (typeof ACTIONS)[number];

type SchedulerAIRequest = {
  action?: string;
  form?: {
    title?: string;
    caption?: string;
    platform?: SocialPlatform;
    contentType?: string;
    scheduledDate?: string;
    scheduledTime?: string;
    hashtags?: string;
    cta?: string;
    campaignId?: string;
    assetIds?: string;
  };
  targetPlatform?: SocialPlatform;
  month?: string;
};

function isAction(value: unknown): value is SchedulerAIAction {
  return typeof value === 'string' && (ACTIONS as readonly string[]).includes(value);
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function parseMonth(value: unknown): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}$/.test(value)) return value;
  return currentMonth();
}

function getActionLabel(action: SchedulerAIAction): string {
  return {
    generate_todays_content: "Generate today's content",
    adapt_instagram: 'Adapt this post for Instagram',
    shorten_x: 'Shorten for X',
    generate_hashtags: 'Generate hashtags',
    suggest_best_time: 'Suggest best time',
    fill_content_gap: 'Fill content gap',
    repurpose_video_captions: 'Repurpose this video into captions',
    create_7_day_campaign: 'Create a 7-day campaign',
  }[action];
}

function getContentType(action: SchedulerAIAction): StudioContentType {
  if (action === 'create_7_day_campaign' || action === 'suggest_best_time') return 'marketing_planner';
  if (action === 'repurpose_video_captions' || action === 'generate_todays_content' || action === 'fill_content_gap') return 'caption';
  return 'caption';
}

function getPlatformLabel(platform?: string): string {
  if (!platform) return 'selected platform';
  return platform === 'x' ? 'X' : platform.charAt(0).toUpperCase() + platform.slice(1);
}

function summarizeAccounts(accounts: SocialAccountRecord[]): string {
  if (accounts.length === 0) return 'No connected social accounts yet.';
  return accounts
    .filter((account) => account.status === 'connected')
    .slice(0, 8)
    .map((account) => `${getPlatformLabel(account.providerId)} ${account.handle || account.accountName || account.providerAccountId || ''}`.trim())
    .join(', ');
}

function summarizeRecentPosts(posts: ScheduledPostRecord[]): string {
  if (posts.length === 0) return 'No scheduled content history for this month.';
  return posts.slice(-12).map((post) => {
    const date = post.scheduledTime ? post.scheduledTime.slice(0, 10) : 'unscheduled';
    return `- ${date} | ${post.platform} | ${post.status} | ${post.title || post.caption?.slice(0, 120) || 'Untitled'}`;
  }).join('\n');
}

function summarizeAnalytics(records: Awaited<ReturnType<typeof listSocialPostAnalytics>>): string {
  if (records.length === 0) return 'No post-level analytics synced yet.';
  return records.slice(0, 10).map((record) => {
    const engagement = (record.metrics.likes || 0) + (record.metrics.comments || 0) + (record.metrics.shares || 0) + (record.metrics.saves || 0) + (record.metrics.clicks || 0);
    return `- ${record.platform}: views ${record.metrics.views}, reach ${record.metrics.reach}, engagement ${engagement}, rate ${record.metrics.engagementRate}`;
  }).join('\n');
}

function findContentGaps(posts: ScheduledPostRecord[], month: string): string[] {
  const [year, monthValue] = month.split('-').map(Number);
  const days = new Date(year, monthValue, 0).getDate();
  const occupied = new Set(posts.map((post) => post.scheduledTime?.slice(0, 10)).filter(Boolean));
  const today = new Date();
  const gaps: string[] = [];
  for (let day = 1; day <= days; day += 1) {
    const date = `${year}-${String(monthValue).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (new Date(`${date}T23:59:59`).getTime() < today.getTime()) continue;
    if (!occupied.has(date)) gaps.push(date);
    if (gaps.length >= 10) break;
  }
  return gaps;
}

function bestTimeFromPosts(posts: ScheduledPostRecord[]): string {
  const hours = new Map<number, number>();
  posts.forEach((post) => {
    if (!post.scheduledTime) return;
    const date = normalizeDate(post.scheduledTime);
    if (!date) return;
    hours.set(date.getHours(), (hours.get(date.getHours()) || 0) + 1);
  });
  const best = [...hours.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 19;
  return `${String(best).padStart(2, '0')}:30`;
}

function parseHashtags(text: string): string[] {
  const matches = text.match(/#[A-Za-z0-9_]+/g) || [];
  return Array.from(new Set(matches.map((tag) => tag.replace(/^#/, '')).filter(Boolean))).slice(0, 12);
}

function extractFirstTime(text: string): string | undefined {
  const direct = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (direct) return `${direct[1].padStart(2, '0')}:${direct[2]}`;
  const ampm = text.match(/\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(AM|PM)\b/i);
  if (!ampm) return undefined;
  let hour = Number(ampm[1]);
  const minute = ampm[2] || '00';
  if (ampm[3].toUpperCase() === 'PM' && hour < 12) hour += 12;
  if (ampm[3].toUpperCase() === 'AM' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${minute}`;
}

function extractCampaignName(text: string): string | undefined {
  const line = text.split('\n').find((entry) => /campaign|theme|series/i.test(entry));
  return sanitizeString((line || '').replace(/^[-#*\d.\s]+/, '').replace(/campaign\s*:?/i, '').trim(), 120) || undefined;
}

function buildSuggestion(action: SchedulerAIAction, generatedContent: string, body: SchedulerAIRequest, gaps: string[], fallbackTime: string) {
  const platform = action === 'adapt_instagram' ? 'instagram' : action === 'shorten_x' ? 'x' : body.targetPlatform || body.form?.platform;
  const hashtags = parseHashtags(generatedContent);
  const cleanCaption = generatedContent
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^caption\s*:/im, '')
    .trim();

  const suggestion: Record<string, unknown> = {
    platform,
    caption: cleanCaption,
    hashtags,
  };

  if (action === 'shorten_x') {
    suggestion.platform = 'x';
    suggestion.caption = cleanCaption.slice(0, 260);
  }
  if (action === 'adapt_instagram') {
    suggestion.platform = 'instagram';
  }
  if (action === 'generate_hashtags') {
    suggestion.caption = body.form?.caption || '';
    suggestion.hashtags = hashtags;
  }
  if (action === 'suggest_best_time') {
    suggestion.caption = body.form?.caption || '';
    suggestion.scheduledTime = extractFirstTime(generatedContent) || fallbackTime;
  }
  if (action === 'fill_content_gap') {
    suggestion.scheduledDate = gaps[0];
    suggestion.scheduledTime = fallbackTime;
  }
  if (action === 'create_7_day_campaign') {
    suggestion.campaignName = extractCampaignName(generatedContent) || '7-day growth campaign';
    suggestion.campaignGoal = generatedContent.slice(0, 500);
    suggestion.scheduledDate = gaps[0];
    suggestion.scheduledTime = fallbackTime;
  }
  if (action === 'generate_todays_content') {
    suggestion.scheduledDate = new Date().toISOString().slice(0, 10);
    suggestion.scheduledTime = fallbackTime;
  }

  return suggestion;
}

function readString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

const handler = createAPIHandler(
  async (req: NextRequest) => {
    const entitlements = await requireSubscription(req as any, 'explorer');
    const body = (await req.json()) as SchedulerAIRequest;

    if (!isAction(body.action)) {
      return apiError('Unsupported scheduler AI action', { status: 400, code: 'INVALID_ACTION' });
    }

    const schedulerPrivileges = getTierPrivileges(entitlements.subscription.plan).scheduler;
    if (body.action === 'create_7_day_campaign' && !schedulerPrivileges.campaigns) {
      return apiError('Campaign planning is available on Pro and Elite plans.', { status: 403, code: 'SCHEDULER_CAMPAIGNS_RESTRICTED' });
    }

    const month = parseMonth(body.month);
    const [userSnap, accounts, posts, analytics, campaignsSnap] = await Promise.all([
      adminDb.collection('users').doc(entitlements.uid).get(),
      listSocialAccounts(entitlements.uid),
      listScheduledPosts(entitlements.uid, { month, limit: 120 }),
      listSocialPostAnalytics(entitlements.uid, { limit: 80 }),
      adminDb.collection('socialCampaigns').where('ownerId', '==', entitlements.uid).limit(12).get().catch(() => null),
    ]);

    const profile = (userSnap.data() || {}) as Record<string, unknown>;
    const gaps = findContentGaps(posts, month);
    const fallbackTime = bestTimeFromPosts(posts);
    const platform = body.action === 'adapt_instagram'
      ? 'instagram'
      : body.action === 'shorten_x'
        ? 'x'
        : body.targetPlatform || body.form?.platform;
    const campaignLines = campaignsSnap
      ? campaignsSnap.docs.map((doc) => {
        const data = doc.data();
        return `- ${data.campaignName || data.name || doc.id}: ${data.goal || data.status || ''}`;
      }).join('\n')
      : 'No active campaigns loaded.';

    const brandVoice = readString(profile, ['brandVoice', 'brandTone', 'voice', 'tone']);
    const businessNiche = readString(profile, ['businessNiche', 'niche', 'industry', 'businessCategory', 'businessType']);
    const targetAudience = readString(profile, ['targetAudience', 'audience', 'idealCustomer']) || 'digital entrepreneurs and online business builders';
    const businessGoals = readString(profile, ['businessGoals', 'goals', 'primaryGoal', 'roadmapGoal']);

    const actionInstructions: Record<SchedulerAIAction, string> = {
      generate_todays_content: 'Create one strong post for today. Include a caption, hook, CTA, and hashtags.',
      adapt_instagram: 'Adapt the current post for Instagram. Prioritize visual-first copy, readability, and hashtags.',
      shorten_x: 'Shorten the current post for X. Keep it punchy and below 260 characters when possible.',
      generate_hashtags: 'Generate relevant hashtags only. Prefer 6-10 useful tags, not spam.',
      suggest_best_time: 'Recommend the best posting time. Explain briefly using connected platforms and performance signals.',
      fill_content_gap: 'Create a post idea and caption for the next open content gap.',
      repurpose_video_captions: 'Repurpose this video or video idea into platform-ready captions and short caption variants.',
      create_7_day_campaign: 'Create a practical 7-day social campaign with daily themes, captions, and goals.',
    };

    const businessContext = [
      `Scheduler AI action: ${getActionLabel(body.action)}.`,
      actionInstructions[body.action],
      `Connected platforms: ${summarizeAccounts(accounts)}.`,
      `Past post performance:\n${summarizeAnalytics(analytics)}.`,
      `Content history:\n${summarizeRecentPosts(posts)}.`,
      `Content gaps: ${gaps.length > 0 ? gaps.join(', ') : 'No future gaps found this month'}.`,
      `Campaign goals:\n${campaignLines}`,
      `Business niche: ${businessNiche || 'Not provided'}.`,
      `Business goals: ${businessGoals || 'Not provided'}.`,
      `Brand voice: ${brandVoice || 'Premium, clear, helpful, professional'}.`,
      body.form?.caption ? `Current draft caption: ${sanitizeString(body.form.caption, 1200)}.` : '',
      body.form?.title ? `Current draft title: ${sanitizeString(body.form.title, 200)}.` : '',
      body.form?.hashtags ? `Current hashtags: ${sanitizeString(body.form.hashtags, 300)}.` : '',
      body.form?.cta ? `Current CTA: ${sanitizeString(body.form.cta, 300)}.` : '',
      body.form?.scheduledDate ? `Current scheduled date: ${sanitizeString(body.form.scheduledDate, 40)} ${sanitizeString(body.form.scheduledTime || '', 20)}.` : '',
    ].filter(Boolean).join('\n\n');

    const generated = await generateStudioContent({
      contentType: getContentType(body.action),
      businessContext,
      targetAudience,
      tone: 'premium',
      platform: getPlatformLabel(platform),
      brandName: readString(profile, ['businessName', 'brandName', 'companyName']) || 'Soma Digital Community creator',
      brandVoice: brandVoice || 'Premium, concise, intelligent, calm, and conversion-aware.',
      campaignGoal: actionInstructions[body.action],
      callToAction: sanitizeString(body.form?.cta || '', 300) || undefined,
      notes: 'Return content that can be pasted directly into the scheduler. Be specific, useful, and platform-aware.',
      userId: entitlements.uid,
    }, {
      userId: entitlements.uid,
      userTier: entitlements.subscription.plan || 'explorer',
    });

    const suggestion = buildSuggestion(body.action, generated.generatedContent, body, gaps, fallbackTime);

    return apiResponse({
      action: body.action,
      label: getActionLabel(body.action),
      content: generated,
      suggestion,
      context: {
        connectedPlatforms: accounts.filter((account) => account.status === 'connected').map((account) => account.providerId),
        contentGaps: gaps,
        analyticsRecords: analytics.length,
        businessNiche: businessNiche || null,
        brandVoice: brandVoice || null,
      },
    });
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 6 },
    timeout: 60000,
  }
);

export const POST = handler;
