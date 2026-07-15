import axios from 'axios';
import { onRequest } from 'firebase-functions/v2/https';
import { defineString } from 'firebase-functions/params';

type SocialPlatform = 'tiktok' | 'instagram' | 'facebook' | 'linkedin' | 'x' | 'youtube';

type AdapterBody = {
  analyticsKind?: 'account' | 'post';
  providerId?: SocialPlatform;
  socialAccountId?: string;
  providerAccountId?: string;
  externalAccountId?: string;
  handle?: string;
  accountName?: string;
  scopes?: string[];
  period?: {
    since?: string;
    until?: string;
  };
  post?: {
    scheduledPostId?: string;
    providerPostId?: string;
    externalPostId?: string;
    platform?: SocialPlatform;
    title?: string | null;
    caption?: string | null;
    publishedAt?: string | null;
  };
};

type AdapterMetrics = {
  reach?: number;
  impressions?: number;
  clicks?: number;
  followers?: number;
  engagement?: number;
  posts?: number;
  profileViews?: number;
  videoViews?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  views?: number;
  engagementRate?: number;
  providerPermalink?: string;
};

const socialAnalyticsAdapterSecret = defineString('SOCIAL_ANALYTICS_ADAPTER_SECRET', { default: '' });
const tiktokApiBaseUrl = defineString('SOCIAL_ANALYTICS_TIKTOK_API_BASE_URL', { default: 'https://open.tiktokapis.com/v2' });
const metaGraphBaseUrl = defineString('SOCIAL_ANALYTICS_META_GRAPH_BASE_URL', { default: 'https://graph.facebook.com/v20.0' });
const youtubeApiBaseUrl = defineString('SOCIAL_ANALYTICS_YOUTUBE_API_BASE_URL', { default: 'https://www.googleapis.com/youtube/v3' });
const linkedinApiBaseUrl = defineString('SOCIAL_ANALYTICS_LINKEDIN_API_BASE_URL', { default: 'https://api.linkedin.com/v2' });
const xApiBaseUrl = defineString('SOCIAL_ANALYTICS_X_API_BASE_URL', { default: 'https://api.twitter.com/2' });

function getBearerToken(authorization?: string): string {
  const value = authorization || '';
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

function requireAdapterSecret(headers: Record<string, string | string[] | undefined>) {
  const expected = socialAnalyticsAdapterSecret.value();
  if (!expected) return;
  const received = headers['x-sdc-analytics-secret'];
  const value = Array.isArray(received) ? received[0] : received;
  if (value !== expected) {
    const error = new Error('Invalid analytics adapter secret.');
    (error as Error & { status?: number }).status = 401;
    throw error;
  }
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function sumMetricRows(payload: unknown, keys: string[]): number | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as Record<string, unknown>).data)
      ? (payload as Record<string, unknown>).data as unknown[]
      : [];

  let total = 0;
  let found = false;

  rows.forEach((row) => {
    if (!row || typeof row !== 'object') return;
    const record = row as Record<string, unknown>;
    keys.forEach((key) => {
      const direct = asNumber(record[key]);
      if (direct !== undefined) {
        total += direct;
        found = true;
      }

      const values = record.values;
      if (Array.isArray(values)) {
        values.forEach((entry) => {
          if (!entry || typeof entry !== 'object') return;
          const value = asNumber((entry as Record<string, unknown>).value);
          if (value !== undefined) {
            total += value;
            found = true;
          }
        });
      }
    });
  });

  return found ? total : undefined;
}

function toUnixSeconds(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return Math.floor(parsed.getTime() / 1000);
}

function cleanMetrics(metrics: AdapterMetrics): AdapterMetrics {
  return Object.fromEntries(
    Object.entries(metrics).filter(([key, value]) => (
      (typeof value === 'number' && Number.isFinite(value))
      || (key === 'providerPermalink' && typeof value === 'string' && value.length > 0)
    ))
  ) as AdapterMetrics;
}

async function fetchTikTokAnalytics(token: string): Promise<{ metrics: AdapterMetrics; raw: unknown }> {
  const baseUrl = tiktokApiBaseUrl.value().replace(/\/$/, '');
  const userInfoResponse = await axios.get(`${baseUrl}/user/info/`, {
    params: {
      fields: [
        'open_id',
        'union_id',
        'avatar_url',
        'display_name',
        'profile_deep_link',
        'is_verified',
        'follower_count',
        'following_count',
        'likes_count',
        'video_count',
      ].join(','),
    },
    headers: { Authorization: `Bearer ${token}` },
  });

  let videoListPayload: unknown = null;
  try {
    const videoListResponse = await axios.post(
      `${baseUrl}/video/list/`,
      { max_count: 20 },
      {
        params: {
          fields: ['id', 'title', 'view_count', 'like_count', 'comment_count', 'share_count'].join(','),
        },
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      }
    );
    videoListPayload = videoListResponse.data;
  } catch (error) {
    videoListPayload = { skipped: true, reason: error instanceof Error ? error.message : String(error) };
  }

  const user = ((userInfoResponse.data as Record<string, unknown>).data as Record<string, unknown> | undefined)?.user as Record<string, unknown> | undefined;
  const videos = (((videoListPayload as Record<string, unknown> | null)?.data as Record<string, unknown> | undefined)?.videos || []) as Array<Record<string, unknown>>;
  const videoViews = videos.reduce((total, video) => total + (asNumber(video.view_count) || 0), 0);
  const engagement = videos.reduce((total, video) => total
    + (asNumber(video.like_count) || 0)
    + (asNumber(video.comment_count) || 0)
    + (asNumber(video.share_count) || 0), 0);

  return {
    metrics: cleanMetrics({
      followers: asNumber(user?.follower_count),
      engagement: engagement || asNumber(user?.likes_count),
      posts: asNumber(user?.video_count),
      videoViews: videoViews || undefined,
      impressions: videoViews || undefined,
      reach: videoViews || undefined,
    }),
    raw: { userInfo: userInfoResponse.data, videoList: videoListPayload },
  };
}

async function fetchInstagramAnalytics(token: string, body: AdapterBody): Promise<{ metrics: AdapterMetrics; raw: unknown }> {
  const accountId = body.providerAccountId || body.externalAccountId;
  if (!accountId) throw new Error('Instagram analytics requires providerAccountId or externalAccountId.');

  const baseUrl = metaGraphBaseUrl.value().replace(/\/$/, '');
  const since = toUnixSeconds(body.period?.since);
  const until = toUnixSeconds(body.period?.until);
  const profileResponse = await axios.get(`${baseUrl}/${accountId}`, {
    params: { fields: 'username,followers_count,media_count' },
    headers: { Authorization: `Bearer ${token}` },
  });
  const insightsResponse = await axios.get(`${baseUrl}/${accountId}/insights`, {
    params: {
      metric: 'reach,impressions,profile_views',
      period: 'day',
      ...(since ? { since } : {}),
      ...(until ? { until } : {}),
    },
    headers: { Authorization: `Bearer ${token}` },
    validateStatus: (status) => status >= 200 && status < 500,
  });

  const profile = profileResponse.data as Record<string, unknown>;
  return {
    metrics: cleanMetrics({
      followers: asNumber(profile.followers_count),
      posts: asNumber(profile.media_count),
      reach: sumMetricRows(insightsResponse.data, ['reach']),
      impressions: sumMetricRows(insightsResponse.data, ['impressions']),
      profileViews: sumMetricRows(insightsResponse.data, ['profile_views', 'profileViews']),
    }),
    raw: { profile: profileResponse.data, insights: insightsResponse.data },
  };
}

async function fetchFacebookAnalytics(token: string, body: AdapterBody): Promise<{ metrics: AdapterMetrics; raw: unknown }> {
  const pageId = body.providerAccountId || body.externalAccountId;
  if (!pageId) throw new Error('Facebook analytics requires providerAccountId or externalAccountId.');

  const baseUrl = metaGraphBaseUrl.value().replace(/\/$/, '');
  const since = toUnixSeconds(body.period?.since);
  const until = toUnixSeconds(body.period?.until);
  const pageResponse = await axios.get(`${baseUrl}/${pageId}`, {
    params: { fields: 'name,fan_count,followers_count' },
    headers: { Authorization: `Bearer ${token}` },
  });
  const insightsResponse = await axios.get(`${baseUrl}/${pageId}/insights`, {
    params: {
      metric: 'page_impressions,page_post_engagements,page_views_total',
      period: 'day',
      ...(since ? { since } : {}),
      ...(until ? { until } : {}),
    },
    headers: { Authorization: `Bearer ${token}` },
    validateStatus: (status) => status >= 200 && status < 500,
  });

  const page = pageResponse.data as Record<string, unknown>;
  return {
    metrics: cleanMetrics({
      followers: asNumber(page.followers_count) || asNumber(page.fan_count),
      impressions: sumMetricRows(insightsResponse.data, ['page_impressions']),
      reach: sumMetricRows(insightsResponse.data, ['page_impressions']),
      engagement: sumMetricRows(insightsResponse.data, ['page_post_engagements']),
      profileViews: sumMetricRows(insightsResponse.data, ['page_views_total']),
    }),
    raw: { page: pageResponse.data, insights: insightsResponse.data },
  };
}

async function fetchYouTubeAnalytics(token: string): Promise<{ metrics: AdapterMetrics; raw: unknown }> {
  const baseUrl = youtubeApiBaseUrl.value().replace(/\/$/, '');
  const channelResponse = await axios.get(`${baseUrl}/channels`, {
    params: { part: 'statistics,snippet', mine: true },
    headers: { Authorization: `Bearer ${token}` },
  });
  const channel = (((channelResponse.data as Record<string, unknown>).items as Array<Record<string, unknown>> | undefined) || [])[0];
  const statistics = (channel?.statistics || {}) as Record<string, unknown>;
  return {
    metrics: cleanMetrics({
      followers: asNumber(statistics.subscriberCount),
      videoViews: asNumber(statistics.viewCount),
      impressions: asNumber(statistics.viewCount),
      reach: asNumber(statistics.viewCount),
      posts: asNumber(statistics.videoCount),
    }),
    raw: channelResponse.data,
  };
}

async function fetchLinkedInAnalytics(token: string, body: AdapterBody): Promise<{ metrics: AdapterMetrics; raw: unknown }> {
  const baseUrl = linkedinApiBaseUrl.value().replace(/\/$/, '');
  const organizationUrn = body.providerAccountId || body.externalAccountId;
  if (!organizationUrn?.startsWith('urn:')) {
    const profileResponse = await axios.get(`${baseUrl}/userinfo`, {
      headers: { Authorization: `Bearer ${token}` },
      validateStatus: (status) => status >= 200 && status < 500,
    });
    return { metrics: {}, raw: { profile: profileResponse.data, note: 'LinkedIn organization URN required for analytics metrics.' } };
  }

  const encodedUrn = encodeURIComponent(organizationUrn);
  const followerResponse = await axios.get(`${baseUrl}/organizationalEntityFollowerStatistics`, {
    params: { q: 'organizationalEntity', organizationalEntity: organizationUrn },
    headers: { Authorization: `Bearer ${token}` },
    validateStatus: (status) => status >= 200 && status < 500,
  });
  const shareResponse = await axios.get(`${baseUrl}/organizationalEntityShareStatistics`, {
    params: { q: 'organizationalEntity', organizationalEntity: organizationUrn },
    headers: { Authorization: `Bearer ${token}` },
    validateStatus: (status) => status >= 200 && status < 500,
  });

  return {
    metrics: cleanMetrics({
      followers: sumMetricRows(followerResponse.data, ['followerCounts', 'organicFollowerCount', 'paidFollowerCount']),
      impressions: sumMetricRows(shareResponse.data, ['impressionCount', 'totalShareStatistics']),
      reach: sumMetricRows(shareResponse.data, ['impressionCount']),
      clicks: sumMetricRows(shareResponse.data, ['clickCount']),
      engagement: sumMetricRows(shareResponse.data, ['engagement', 'likeCount', 'commentCount', 'shareCount']),
    }),
    raw: { followerStatistics: followerResponse.data, shareStatistics: shareResponse.data, organizationUrn: encodedUrn },
  };
}

async function fetchXAnalytics(token: string): Promise<{ metrics: AdapterMetrics; raw: unknown }> {
  const baseUrl = xApiBaseUrl.value().replace(/\/$/, '');
  const userResponse = await axios.get(`${baseUrl}/users/me`, {
    params: { 'user.fields': 'public_metrics,verified,profile_image_url' },
    headers: { Authorization: `Bearer ${token}` },
  });
  const user = ((userResponse.data as Record<string, unknown>).data || {}) as Record<string, unknown>;
  const metrics = (user.public_metrics || {}) as Record<string, unknown>;
  return {
    metrics: cleanMetrics({
      followers: asNumber(metrics.followers_count),
      posts: asNumber(metrics.tweet_count),
    }),
    raw: userResponse.data,
  };
}

function calculateEngagementRate(metrics: AdapterMetrics): AdapterMetrics {
  const interactions = (metrics.likes || 0) + (metrics.comments || 0) + (metrics.shares || 0) + (metrics.saves || 0) + (metrics.clicks || 0);
  const base = metrics.reach || metrics.impressions || metrics.views || metrics.videoViews || 0;
  return {
    ...metrics,
    engagement: metrics.engagement || interactions || undefined,
    engagementRate: base > 0 ? Number(((interactions / base) * 100).toFixed(2)) : 0,
  };
}

async function fetchTikTokPostAnalytics(token: string, body: AdapterBody): Promise<{ metrics: AdapterMetrics; raw: unknown }> {
  const videoId = body.post?.providerPostId || body.post?.externalPostId;
  if (!videoId) throw new Error('TikTok post analytics requires providerPostId.');
  const baseUrl = tiktokApiBaseUrl.value().replace(/\/$/, '');
  const response = await axios.post(
    `${baseUrl}/video/query/`,
    { filters: { video_ids: [videoId] } },
    {
      params: { fields: ['id', 'title', 'share_url', 'view_count', 'like_count', 'comment_count', 'share_count'].join(',') },
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      validateStatus: (status) => status >= 200 && status < 500,
    }
  );
  const videos = (((response.data as Record<string, unknown>).data as Record<string, unknown> | undefined)?.videos || []) as Array<Record<string, unknown>>;
  const video = videos[0] || {};
  return {
    metrics: calculateEngagementRate(cleanMetrics({
      views: asNumber(video.view_count),
      impressions: asNumber(video.view_count),
      reach: asNumber(video.view_count),
      likes: asNumber(video.like_count),
      comments: asNumber(video.comment_count),
      shares: asNumber(video.share_count),
      providerPermalink: typeof video.share_url === 'string' ? video.share_url : undefined,
    })),
    raw: response.data,
  };
}

async function fetchMetaPostAnalytics(token: string, body: AdapterBody, provider: 'instagram' | 'facebook'): Promise<{ metrics: AdapterMetrics; raw: unknown }> {
  const postId = body.post?.providerPostId || body.post?.externalPostId;
  if (!postId) throw new Error(`${provider} post analytics requires providerPostId.`);
  const baseUrl = metaGraphBaseUrl.value().replace(/\/$/, '');
  const fields = provider === 'instagram'
    ? 'permalink,like_count,comments_count'
    : 'permalink_url,shares.summary(true),comments.summary(true),reactions.summary(true)';
  const postResponse = await axios.get(`${baseUrl}/${postId}`, {
    params: { fields },
    headers: { Authorization: `Bearer ${token}` },
    validateStatus: (status) => status >= 200 && status < 500,
  });
  const insightMetric = provider === 'instagram'
    ? 'reach,impressions,saved,likes,comments,shares,views'
    : 'post_impressions,post_impressions_unique,post_engaged_users,post_clicks';
  const insightsResponse = await axios.get(`${baseUrl}/${postId}/insights`, {
    params: { metric: insightMetric },
    headers: { Authorization: `Bearer ${token}` },
    validateStatus: (status) => status >= 200 && status < 500,
  });
  const post = postResponse.data as Record<string, unknown>;
  const sharesSummary = (post.shares as Record<string, unknown> | undefined)?.count;
  const commentsSummary = ((post.comments as Record<string, unknown> | undefined)?.summary as Record<string, unknown> | undefined)?.total_count;
  const reactionsSummary = ((post.reactions as Record<string, unknown> | undefined)?.summary as Record<string, unknown> | undefined)?.total_count;
  return {
    metrics: calculateEngagementRate(cleanMetrics({
      likes: asNumber(post.like_count) || asNumber(reactionsSummary),
      comments: asNumber(post.comments_count) || asNumber(commentsSummary),
      shares: asNumber(sharesSummary) || sumMetricRows(insightsResponse.data, ['shares']),
      saves: sumMetricRows(insightsResponse.data, ['saved', 'saves']),
      clicks: sumMetricRows(insightsResponse.data, ['post_clicks', 'clicks']),
      views: sumMetricRows(insightsResponse.data, ['views', 'video_views']),
      reach: sumMetricRows(insightsResponse.data, ['reach', 'post_impressions_unique']),
      impressions: sumMetricRows(insightsResponse.data, ['impressions', 'post_impressions']),
      providerPermalink: typeof post.permalink === 'string' ? post.permalink : typeof post.permalink_url === 'string' ? post.permalink_url : undefined,
    })),
    raw: { post: postResponse.data, insights: insightsResponse.data },
  };
}

async function fetchYouTubePostAnalytics(token: string, body: AdapterBody): Promise<{ metrics: AdapterMetrics; raw: unknown }> {
  const videoId = body.post?.providerPostId || body.post?.externalPostId;
  if (!videoId) throw new Error('YouTube post analytics requires providerPostId.');
  const baseUrl = youtubeApiBaseUrl.value().replace(/\/$/, '');
  const response = await axios.get(`${baseUrl}/videos`, {
    params: { part: 'statistics,snippet', id: videoId },
    headers: { Authorization: `Bearer ${token}` },
  });
  const item = (((response.data as Record<string, unknown>).items as Array<Record<string, unknown>> | undefined) || [])[0] || {};
  const statistics = (item.statistics || {}) as Record<string, unknown>;
  return {
    metrics: calculateEngagementRate(cleanMetrics({
      views: asNumber(statistics.viewCount),
      impressions: asNumber(statistics.viewCount),
      reach: asNumber(statistics.viewCount),
      likes: asNumber(statistics.likeCount),
      comments: asNumber(statistics.commentCount),
      providerPermalink: `https://www.youtube.com/watch?v=${videoId}`,
    })),
    raw: response.data,
  };
}

async function fetchXPostAnalytics(token: string, body: AdapterBody): Promise<{ metrics: AdapterMetrics; raw: unknown }> {
  const tweetId = body.post?.providerPostId || body.post?.externalPostId;
  if (!tweetId) throw new Error('X post analytics requires providerPostId.');
  const baseUrl = xApiBaseUrl.value().replace(/\/$/, '');
  const response = await axios.get(`${baseUrl}/tweets/${tweetId}`, {
    params: { 'tweet.fields': 'public_metrics,non_public_metrics,organic_metrics' },
    headers: { Authorization: `Bearer ${token}` },
    validateStatus: (status) => status >= 200 && status < 500,
  });
  const data = ((response.data as Record<string, unknown>).data || {}) as Record<string, unknown>;
  const publicMetrics = (data.public_metrics || {}) as Record<string, unknown>;
  const organicMetrics = (data.organic_metrics || {}) as Record<string, unknown>;
  const nonPublicMetrics = (data.non_public_metrics || {}) as Record<string, unknown>;
  return {
    metrics: calculateEngagementRate(cleanMetrics({
      likes: asNumber(publicMetrics.like_count),
      comments: asNumber(publicMetrics.reply_count),
      shares: asNumber(publicMetrics.retweet_count),
      views: asNumber(publicMetrics.impression_count) || asNumber(nonPublicMetrics.impression_count) || asNumber(organicMetrics.impression_count),
      impressions: asNumber(publicMetrics.impression_count) || asNumber(nonPublicMetrics.impression_count) || asNumber(organicMetrics.impression_count),
      clicks: asNumber(nonPublicMetrics.url_link_clicks) || asNumber(organicMetrics.url_link_clicks),
    })),
    raw: response.data,
  };
}

async function fetchLinkedInPostAnalytics(token: string, body: AdapterBody): Promise<{ metrics: AdapterMetrics; raw: unknown }> {
  const postUrn = body.post?.providerPostId || body.post?.externalPostId;
  if (!postUrn) throw new Error('LinkedIn post analytics requires providerPostId.');
  const baseUrl = linkedinApiBaseUrl.value().replace(/\/$/, '');
  const encodedPostUrn = encodeURIComponent(postUrn);
  const socialActionsResponse = await axios.get(`${baseUrl}/socialActions/${encodedPostUrn}`, {
    headers: { Authorization: `Bearer ${token}` },
    validateStatus: (status) => status >= 200 && status < 500,
  });
  const shareStatsResponse = await axios.get(`${baseUrl}/organizationalEntityShareStatistics`, {
    params: { q: 'organizationalEntity', shares: `List(${postUrn})` },
    headers: { Authorization: `Bearer ${token}` },
    validateStatus: (status) => status >= 200 && status < 500,
  });
  return {
    metrics: calculateEngagementRate(cleanMetrics({
      likes: sumMetricRows(socialActionsResponse.data, ['likesSummary', 'likeCount']),
      comments: sumMetricRows(socialActionsResponse.data, ['commentsSummary', 'commentCount']),
      shares: sumMetricRows(shareStatsResponse.data, ['shareCount']),
      clicks: sumMetricRows(shareStatsResponse.data, ['clickCount']),
      impressions: sumMetricRows(shareStatsResponse.data, ['impressionCount']),
      reach: sumMetricRows(shareStatsResponse.data, ['uniqueImpressionsCount', 'impressionCount']),
    })),
    raw: { socialActions: socialActionsResponse.data, shareStatistics: shareStatsResponse.data },
  };
}

async function fetchProviderAnalytics(provider: SocialPlatform, token: string, body: AdapterBody) {
  if (body.analyticsKind === 'post') {
    switch (provider) {
      case 'tiktok':
        return fetchTikTokPostAnalytics(token, body);
      case 'instagram':
        return fetchMetaPostAnalytics(token, body, 'instagram');
      case 'facebook':
        return fetchMetaPostAnalytics(token, body, 'facebook');
      case 'linkedin':
        return fetchLinkedInPostAnalytics(token, body);
      case 'x':
        return fetchXPostAnalytics(token, body);
      case 'youtube':
        return fetchYouTubePostAnalytics(token, body);
      default:
        throw new Error(`Unsupported post analytics provider: ${provider}`);
    }
  }

  switch (provider) {
    case 'tiktok':
      return fetchTikTokAnalytics(token);
    case 'instagram':
      return fetchInstagramAnalytics(token, body);
    case 'facebook':
      return fetchFacebookAnalytics(token, body);
    case 'linkedin':
      return fetchLinkedInAnalytics(token, body);
    case 'x':
      return fetchXAnalytics(token);
    case 'youtube':
      return fetchYouTubeAnalytics(token);
    default:
      throw new Error(`Unsupported analytics provider: ${provider}`);
  }
}

function createAnalyticsAdapter(provider: SocialPlatform) {
  return onRequest({ cors: false }, async (req, res) => {
    try {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      requireAdapterSecret(req.headers);
      const token = getBearerToken(req.headers.authorization);
      if (!token) {
        res.status(401).json({ error: 'Missing provider bearer token.' });
        return;
      }

      const body = (req.body || {}) as AdapterBody;
      const result = await fetchProviderAnalytics(provider, token, body);
      res.status(200).json({
        providerId: provider,
        socialAccountId: body.socialAccountId || null,
        metrics: result.metrics,
        raw: result.raw,
      });
    } catch (error) {
      const status = (error as Error & { status?: number }).status || 500;
      const message = error instanceof Error ? error.message : String(error);
      res.status(status).json({ error: message });
    }
  });
}

export const socialAnalyticsTikTok = createAnalyticsAdapter('tiktok');
export const socialAnalyticsInstagram = createAnalyticsAdapter('instagram');
export const socialAnalyticsFacebook = createAnalyticsAdapter('facebook');
export const socialAnalyticsLinkedIn = createAnalyticsAdapter('linkedin');
export const socialAnalyticsX = createAnalyticsAdapter('x');
export const socialAnalyticsYouTube = createAnalyticsAdapter('youtube');
