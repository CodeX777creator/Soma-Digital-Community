import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/serverAuth';
import { adminDb } from '@/lib/firebaseAdmin';
import { Timestamp } from 'firebase-admin/firestore';
import { DEFAULT_POST_CHANNEL, isPostChannel } from '@/lib/communityChannels';
import type { PostType } from '@/lib/db';

type CreateCommunityPostRequest = {
  content?: unknown;
  channel?: unknown;
  tags?: unknown;
  type?: unknown;
  imageUrl?: unknown;
  linkUrl?: unknown;
};

const POST_TYPES: PostType[] = ['win', 'insight', 'mentorship', 'announcement', 'question'];

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 10);
}

function isValidUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  try {
    const { uid, email } = await requireAuth(req as any);
    const body = (await req.json()) as CreateCommunityPostRequest;

    const rawContent = typeof body.content === 'string' ? body.content : '';
    const content = rawContent.trim();
    const imageUrl = body.imageUrl;
    const linkUrl = body.linkUrl;

    if (!content && !imageUrl && !linkUrl) {
      return NextResponse.json({ error: 'Post content, image, or link is required' }, { status: 400 });
    }

    if (imageUrl !== undefined && imageUrl !== null && !isValidUrl(imageUrl)) {
      return NextResponse.json({ error: 'Invalid image URL' }, { status: 400 });
    }

    if (linkUrl !== undefined && linkUrl !== null && !isValidUrl(linkUrl)) {
      return NextResponse.json({ error: 'Invalid link URL' }, { status: 400 });
    }

    const channel = isPostChannel(body.channel) ? body.channel : DEFAULT_POST_CHANNEL;
    const type = POST_TYPES.includes(body.type as PostType) ? (body.type as PostType) : 'insight';
    const tags = normalizeTags(body.tags);

    const userSnap = await adminDb.collection('users').doc(uid).get();
    const userData = userSnap.exists ? userSnap.data() : null;
    const authorName = userData?.name || userData?.displayName || email || 'Member';
    const authorAvatar = userData?.photoURL || userData?.avatarURL || userData?.avatarUrl || '';
    const tier = userData?.tier || userData?.subscription?.subscriptionPlan || userData?.subscription?.plan || 'explorer';
    const authorTier = ['explorer', 'pro', 'elite'].includes(tier) ? tier : 'explorer';

    const postRef = adminDb.collection('posts').doc();
    await postRef.set({
      authorId: uid,
      authorName,
      authorAvatar,
      authorTier,
      authorRole: userData?.selectedIdentity || userData?.role || 'Entrepreneur',
      isFounder: false,
      content,
      channel,
      tags,
      type,
      isPinned: false,
      likeCount: 0,
      commentCount: 0,
      reactionCounts: {},
      imageUrl: typeof imageUrl === 'string' ? imageUrl.trim() : null,
      linkUrl: typeof linkUrl === 'string' ? linkUrl.trim() : null,
      createdAt: Timestamp.now(),
    });

    return NextResponse.json({ id: postRef.id });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Unauthorized' },
      { status: error.status || 401 }
    );
  }
}
