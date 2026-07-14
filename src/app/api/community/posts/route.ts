import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/serverAuth';
import { adminDb, adminAuth } from '@/lib/firebaseAdmin';
import { Timestamp } from 'firebase-admin/firestore';
import { DEFAULT_POST_CHANNEL, isPostChannel } from '@/lib/communityChannels';
import { apiResponse, apiError, createAPIHandler, getClientIP } from '@/lib/api-middleware';
import { logger } from '@/lib/logger';
import { sanitizeString, validateUrl } from '@/lib/security';
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

// Profanity filter (basic implementation)
const PROFANITY_PATTERNS = [
  /\b(f+u+c+k+|s+h+i+t+|a+s+s+h+o+l+e+|b+i+t+c+h+)\b/gi,
  /\b(n+i+g+g+e+r+|f+a+g+g+o+t+)\b/gi,
];

function containsProfanity(text: string): boolean {
  return PROFANITY_PATTERNS.some(pattern => pattern.test(text));
}

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => sanitizeString(tag.trim(), 50))
    .filter(Boolean)
    .slice(0, 10);
}

function isValidUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  
  try {
    const parsed = new URL(trimmed);
    // SECURITY: Strict protocol validation
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return false;
    }
    // SECURITY: Block common XSS vectors in URLs
    const lowerHref = parsed.toString().toLowerCase();
    if (lowerHref.includes('javascript:') || 
        lowerHref.includes('data:') || 
        lowerHref.includes('vbscript:') ||
        lowerHref.includes('<script') ||
        lowerHref.includes('onerror=') ||
        lowerHref.includes('onload=')) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function isOwnedCommunityImageUrl(value: string, uid: string): boolean {
  try {
    const parsed = new URL(value);
    const decodedPath = decodeURIComponent(parsed.pathname);
    const encodedOwnerPath = `community-posts%2F${uid}%2F`;
    const decodedOwnerPath = `community-posts/${uid}/`;

    return (
      parsed.hostname.endsWith("firebasestorage.googleapis.com") &&
      (
        parsed.pathname.includes(encodedOwnerPath) ||
        decodedPath.includes(decodedOwnerPath)
      )
    );
  } catch {
    return false;
  }
}

const handler = createAPIHandler(
  async (req) => {
    const { uid, email } = await requireAuth(req as any);
    const body = (await req.json()) as CreateCommunityPostRequest;
    const clientIP = getClientIP(req);

    const rawContent = typeof body.content === 'string' ? body.content : '';
    const content = sanitizeString(rawContent.trim(), 5000);
    const imageUrl = body.imageUrl;
    const linkUrl = body.linkUrl;

    if (!content && !imageUrl && !linkUrl) {
      return apiError('Post content, image, or link is required', { 
        status: 400, 
        code: 'MISSING_CONTENT' 
      });
    }

    if (content.length > 5000) {
      return apiError('Content too long (max 5000 characters)', { 
        status: 400, 
        code: 'CONTENT_TOO_LONG' 
      });
    }

    // Check for profanity
    if (containsProfanity(content)) {
      logger.warn('Profanity detected in post', { userId: uid, ip: clientIP });
      return apiError('Content contains inappropriate language', {
        status: 400,
        code: 'INAPPROPRIATE_CONTENT'
      });
    }

    // Validate URLs
    if (imageUrl !== undefined && imageUrl !== null) {
      if (typeof imageUrl !== 'string' || !isValidUrl(imageUrl)) {
        return apiError('Invalid image URL', { status: 400, code: 'INVALID_IMAGE_URL' });
      }
      const urlValidation = validateUrl(imageUrl);
      if (!urlValidation.valid) {
        return apiError('Invalid image URL format', { status: 400, code: 'INVALID_IMAGE_URL' });
      }
      if (!isOwnedCommunityImageUrl(imageUrl, uid)) {
        return apiError('Image must be uploaded from your community media library', {
          status: 400,
          code: 'IMAGE_NOT_OWNED',
        });
      }
    }

    if (linkUrl !== undefined && linkUrl !== null) {
      if (typeof linkUrl !== 'string' || !isValidUrl(linkUrl)) {
        return apiError('Invalid link URL', { status: 400, code: 'INVALID_LINK_URL' });
      }
      const urlValidation = validateUrl(linkUrl);
      if (!urlValidation.valid) {
        return apiError('Invalid link URL format', { status: 400, code: 'INVALID_LINK_URL' });
      }
    }

    const channel = isPostChannel(body.channel) ? body.channel : DEFAULT_POST_CHANNEL;
    const type = POST_TYPES.includes(body.type as PostType) ? (body.type as PostType) : 'insight';
    const tags = normalizeTags(body.tags);

    // Fetch user data with timeout
    const [userSnap, authUser] = await Promise.all([
      adminDb.collection('users').doc(uid).get(),
      adminAuth.getUser(uid).catch(() => null),
    ]);

    const userData = userSnap.exists ? userSnap.data() : null;
    
    // Check if user is disabled
    if (userData?.disabled === true || userData?.status === 'banned') {
      return apiError('Account is disabled', { status: 403, code: 'ACCOUNT_DISABLED' });
    }
    
    const authorName = userData?.name 
      || authUser?.displayName 
      || userData?.displayName 
      || email?.split('@')[0] 
      || 'Member';
    
    logger.info('Author name lookup', { 
      name: authorName,
      userName: userData?.name,
      authDisplayName: authUser?.displayName,
      userDisplayName: userData?.displayName
    });
    
    // If name is missing from Firestore but available in Auth, save it for future use
    if (!userData?.name && authUser?.displayName && userSnap.exists) {
      try {
        await adminDb.collection('users').doc(uid).update({
          name: authUser.displayName,
          updatedAt: Timestamp.now(),
        });
        logger.info('Updated user name from Auth');
      } catch (err) {
        logger.error('Failed to update user name', err instanceof Error ? err : undefined);
      }
    }

    // Handle avatar from multiple possible fields for compatibility
    const authorAvatar = userData?.photoURL || userData?.avatarURL || userData?.avatarUrl || authUser?.photoURL || '';
    logger.info('Author avatar lookup', { 
      photoURL: userData?.photoURL,
      avatarURL: userData?.avatarURL,
      finalAvatar: authorAvatar
    });
    const tier = userData?.tier || userData?.subscription?.subscriptionPlan || userData?.subscription?.plan || 'explorer';
    const authorTier = ['explorer', 'pro', 'elite'].includes(tier) ? tier : 'explorer';

    const postRef = adminDb.collection('posts').doc();
    await postRef.set({
      authorId: uid,
      authorName: sanitizeString(authorName, 100),
      authorAvatar,
      authorTier,
      authorRole: sanitizeString(userData?.selectedIdentity || userData?.role || 'Entrepreneur', 50),
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
      createdByIP: clientIP, // Track IP for abuse detection
    });

    logger.info('Post created', { postId: postRef.id, authorId: uid, type });

    return apiResponse({ id: postRef.id }, { status: 201 });
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 5 },
  }
);

export const POST = handler;
