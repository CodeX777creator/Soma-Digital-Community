import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { logger } from '@/lib/logger';
import { requireUserEntitlements } from '@/lib/serverAuth';
import { getSubscriptionPlan } from '@/lib/entitlements';
import { listEvents } from '@/events';
import { getAcademyDashboardIntegration } from '@/academy';

type ProgressStep = {
  id: string;
  label: string;
  href: string;
  completed: boolean;
  detail?: string;
};

type DashboardScheduledPost = {
  id: string;
  scheduledPostId?: unknown;
  title?: unknown;
  caption?: unknown;
  platform?: unknown;
  status?: unknown;
  scheduledTime?: unknown;
  metadata?: unknown;
};

function shiftMonth(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1 + delta, 1)).toISOString().slice(0, 7);
}

function getStageLabel(progress: number): string {
  if (progress >= 100) return 'Operating System Builder';
  if (progress >= 75) return 'Growth Operator';
  if (progress >= 50) return 'Momentum Builder';
  if (progress >= 25) return 'Foundation Builder';
  return 'Starting Point';
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    try {
      return (value as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return null;
    }
  }
  return null;
}

async function safeSize(query: FirebaseFirestore.Query): Promise<number> {
  try {
    const snap = await query.get();
    return snap.size;
  } catch (error) {
    logger.warn('[API /dashboard/summary] Count query failed', { error: error instanceof Error ? error.message : String(error) });
    return 0;
  }
}

export async function GET(req: NextRequest) {
  try {
    const entitlements = await requireUserEntitlements(req);
    const uid = entitlements.uid;
    const profile = entitlements.profile || {};

    const [
      roadmapSnap,
      communityPostCount,
      mentorThreadCount,
      scheduledSnap,
      socialAccountCount,
      currentMonthEvents,
      nextMonthEvents,
      academy,
    ] = await Promise.all([
      adminDb.collection('users').doc(uid).collection('roadmaps').limit(1).get(),
      safeSize(adminDb.collection('posts').where('authorId', '==', uid).limit(1)),
      safeSize(adminDb.collection('users').doc(uid).collection('mentorHistory').limit(3)),
      adminDb.collection('scheduledPosts').where('ownerId', '==', uid).limit(80).get().catch((error) => {
        logger.warn('[API /dashboard/summary] Scheduled posts query failed', { error: error instanceof Error ? error.message : String(error) });
        return null;
      }),
      safeSize(adminDb.collection('socialAccounts').where('ownerId', '==', uid).where('status', '==', 'connected').limit(1)),
      listEvents(
        {
          tier: getSubscriptionPlan(entitlements.subscription.subscriptionPlan),
          isAdmin: entitlements.isAdmin,
          userId: uid,
        },
        { month: new Date().toISOString().slice(0, 7), status: 'all', limit: 80 }
      ).catch((error) => {
        logger.warn('[API /dashboard/summary] Current month events query failed', { error: error instanceof Error ? error.message : String(error) });
        return [];
      }),
      listEvents(
        {
          tier: getSubscriptionPlan(entitlements.subscription.subscriptionPlan),
          isAdmin: entitlements.isAdmin,
          userId: uid,
        },
        { month: shiftMonth(new Date().toISOString().slice(0, 7), 1), status: 'all', limit: 80 }
      ).catch((error) => {
        logger.warn('[API /dashboard/summary] Next month events query failed', { error: error instanceof Error ? error.message : String(error) });
        return [];
      }),
      getAcademyDashboardIntegration(uid).catch((error) => {
        logger.warn('[API /dashboard/summary] Academy integration query failed', { error: error instanceof Error ? error.message : String(error) });
        return null;
      }),
    ]);

    const scheduledPosts: DashboardScheduledPost[] = scheduledSnap
      ? scheduledSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }) as DashboardScheduledPost)
      : [];
    const schedulerPosts = scheduledPosts.filter((post) => {
      return !(typeof post.metadata === 'object' && post.metadata && (post.metadata as Record<string, unknown>).calendarMode === 'events');
    });
    const now = Date.now();
    const upcoming = schedulerPosts
      .map((post) => ({
        id: String(post.scheduledPostId || post.id),
        title: typeof post.title === 'string' && post.title.trim() ? post.title.trim() : null,
        caption: typeof post.caption === 'string' ? post.caption : '',
        platform: typeof post.platform === 'string' ? post.platform : 'social',
        status: typeof post.status === 'string' ? post.status : 'draft',
        scheduledTime: toIso(post.scheduledTime) || '',
        mode: 'scheduler',
      }))
      .filter((post) => post.scheduledTime && new Date(post.scheduledTime).getTime() >= now)
      .sort((a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime());

    const upcomingEvents = [...currentMonthEvents, ...nextMonthEvents]
      .filter((event) => ['scheduled', 'live'].includes(event.status))
      .filter((event) => new Date(event.startsAt).getTime() >= now || event.status === 'live')
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
      .slice(0, 3)
      .map((event) => ({
        id: event.eventId,
        eventId: event.eventId,
        title: event.title,
        description: event.description,
        eventType: event.eventType,
        status: event.status,
        startsAt: event.startsAt,
        timezone: event.timezone,
        hostName: event.hostName || null,
        viewerRsvp: event.viewerRsvp || null,
      }));
    const upcomingContent = upcoming.filter((post) => post.mode !== 'events').slice(0, 3);

    const roadmapGenerated = profile.roadmapGenerated === true || !roadmapSnap.empty;
    const onboardingComplete = profile.onboardingComplete === true;
    const steps: ProgressStep[] = [
      {
        id: 'profile',
        label: 'Complete profile',
        href: '/profile',
        completed: Boolean(onboardingComplete || profile.name || profile.displayName),
      },
      {
        id: 'roadmap',
        label: 'Generate business roadmap',
        href: '/roadmap',
        completed: roadmapGenerated,
      },
      {
        id: 'mentor',
        label: 'Ask AI Mentor 3 times',
        href: '/mentor',
        completed: mentorThreadCount >= 3,
        detail: `${Math.min(mentorThreadCount, 3)} / 3`,
      },
      {
        id: 'community',
        label: 'Create your first post',
        href: '/community',
        completed: communityPostCount > 0,
      },
      {
        id: 'scheduler',
        label: 'Schedule your first content post',
        href: '/social/calendar?mode=scheduler',
        completed: upcomingContent.length > 0 || schedulerPosts.some((post) => post.status === 'scheduled' || post.status === 'published'),
      },
    ];
    const completedSteps = steps.filter((step) => step.completed).length;
    const progress = Math.round((completedSteps / steps.length) * 100);
    const nextStep = steps.find((step) => !step.completed) || steps[steps.length - 1];

    const recommendations = steps
      .filter((step) => !step.completed)
      .slice(0, 3)
      .map((step) => ({
        title: step.label,
        type: step.id === 'roadmap' ? 'Roadmap' : step.id === 'scheduler' ? 'Scheduler' : 'Action',
        href: step.href,
        description: step.id === 'mentor'
          ? 'Use Soma AI to clarify your next move.'
          : step.id === 'community'
            ? 'Share progress and get feedback from the community.'
            : step.id === 'scheduler'
              ? 'Plan content so your business shows up consistently.'
              : 'Complete this to improve your operating system signal.',
      }));

    if (recommendations.length < 3) {
      recommendations.push(
        { title: 'Create with AI Studio', type: 'AI Studio', href: '/ai/studio', description: 'Turn your next idea into content, media, or a campaign.' },
        { title: 'Review your analytics', type: 'Analytics', href: '/analytics', description: 'See which parts of your business need attention.' },
      );
    }

    const automationReady = socialAccountCount > 0 && schedulerPosts.some((post) => post.status === 'scheduled');

    return NextResponse.json({
      roadmap: {
        generated: roadmapGenerated,
        progress,
        completedSteps,
        totalSteps: steps.length,
        stageLabel: getStageLabel(progress),
        steps,
        nextStep,
      },
      recommendations: recommendations.slice(0, 3),
      events: upcomingEvents,
      scheduledContent: upcomingContent,
      automation: {
        status: automationReady ? 'ready' : socialAccountCount > 0 ? 'needs_schedule' : 'needs_connection',
        href: automationReady ? '/social/calendar?mode=scheduler' : '/social',
        label: automationReady ? 'Automation ready' : socialAccountCount > 0 ? 'Schedule content' : 'Connect a platform',
        description: automationReady
          ? 'Scheduled publishing is ready for your connected accounts.'
          : socialAccountCount > 0
            ? 'Add scheduled posts to activate your publishing workflow.'
            : 'Connect a social account before enabling publishing workflows.',
      },
      academy,
      activity: {
        communityPosts: communityPostCount,
        mentorThreads: mentorThreadCount,
        scheduledPosts: schedulerPosts.length,
        connectedAccounts: socialAccountCount,
      },
    });
  } catch (error) {
    logger.error('[API /dashboard/summary] Failed to load dashboard summary', error instanceof Error ? error : undefined);
    return NextResponse.json({ error: 'Unable to load dashboard summary.' }, { status: 500 });
  }
}
