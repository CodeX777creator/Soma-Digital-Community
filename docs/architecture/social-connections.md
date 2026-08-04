# Social Account Connections And Scheduler

This document is the source of truth for how SDC connects to, publishes through,
and reads analytics from each social platform.

## Connection lifecycle

1. The user starts an OAuth connection from Social Accounts.
2. SDC creates a signed, short-lived state record and requests only the scopes
   required by the provider flow.
3. The provider redirects to the provider-specific callback.
4. SDC verifies state, exchanges the code server-side, resolves the provider
   identity, encrypts the credentials, and stores the connection readiness.
5. The scheduler selects only a connected account with a usable token, a
   provider destination, compatible content, and the required permission set.
6. The native publisher calls the provider API. A publish attempt is marked
   successful only when the provider returns an external post, media, video, or
   publish ID.
7. Provider-specific status polling or reconciliation completes the lifecycle.

Credentials never belong in client bundles or scheduled-post documents. The
worker reads the encrypted account secret at execution time.

## Provider matrix

### TikTok

**Connection:** Login Kit OAuth 2.0 with PKCE. SDC requests identity, video
listing, upload, and publish scopes. `video.publish` is needed for Direct Post;
`video.upload` is sufficient for an Inbox/Draft upload.

**Publishing:** The worker uses the Content Posting API. Videos and photos use
`PULL_FROM_URL` only after the media host is configured in
`SOCIAL_TIKTOK_VERIFIED_URL_PREFIXES`. Photo posts use the Content Posting
`PHOTO` flow and can contain up to 35 images. The worker calls creator-info
first, uses an allowed privacy option, and records the returned `publish_id`.

**Important platform requirements:** Direct Post and photo publishing depend on
TikTok product access, app review, approved scopes, creator eligibility, and
verified URL ownership. SDC must not present a connection as publish-ready when
the app has not been approved for the requested capability.

**Status:** `publish/status/fetch` is polled until the provider reports a final
state. A submitted request is not shown as published before that confirmation.

**Official references:**

- https://developers.tiktok.com/doc/login-kit-overview
- https://developers.tiktok.com/doc/login-kit-manage-user-access-tokens
- https://developers.tiktok.com/doc/content-posting-api-reference-upload-video
- https://developers.tiktok.com/doc/content-posting-api-reference-photo-post/
- https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide

### Instagram

**Connection:** SDC uses Instagram Business Login for the Instagram OAuth flow
and stores `loginType: instagram_business_login` in the account identity. This
means the Instagram user access token is sent to `graph.instagram.com`, not to
the Facebook Page-token path. If a future Facebook Login connection is used,
the publisher selects the Facebook Graph host and resolves a Page access token.

**Eligibility:** The connected account must be an Instagram Professional
account. Publishing requires `instagram_business_content_publish`; analytics
requires the basic and insights permissions supported by the selected login
path.

**Publishing:** SDC creates media containers, waits for video containers to
reach `FINISHED`, then calls `media_publish`. Feed media, Reels, Stories, and
carousels are mapped to the provider's `media_type`; carousel children are
created before the parent container.

**Official references:**

- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
- https://developers.facebook.com/docs/instagram-platform/content-publishing/
- https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api

### Facebook

**Connection:** SDC uses Facebook Login with Page permissions. The user token
is used to call `/me/accounts`; the selected Page ID and Page access token are
then used for Page publishing and Page analytics.

**Publishing:** Page feed, photo, and video operations use the Graph API with
the Page access token. The Page destination is stored on the social account so
the scheduler cannot accidentally publish to an arbitrary Page.

**Operational rule:** If more than one Page is returned, the connection emits a
warning until the user selects a destination. Publishing readiness still
requires a resolved Page ID.

**Official references:**

- https://developers.facebook.com/docs/pages-api
- https://developers.facebook.com/docs/pages-api/getting-started
- https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-page

### LinkedIn

**Connection:** SDC uses OAuth 2.0 with PKCE and requests member publishing
(`w_member_social`). Organization publishing additionally needs
`w_organization_social`, an organization URN, and an eligible organization
role. The account must have a provider destination.

**Publishing:** SDC uses `POST https://api.linkedin.com/rest/posts` with
`Linkedin-Version` and `X-Restli-Protocol-Version` headers. Text posts use the
Posts payload; image posts first register/upload an image asset and then refer
to its media URN. Video and document publishing remain blocked until dedicated
upload adapters are available, so the scheduler does not falsely claim those
formats are supported.

**Response handling:** LinkedIn commonly returns the created post identifier in
`x-restli-id`; the worker records that header as the external post ID.

**Official references:**

- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview
- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api

### X

**Connection:** SDC uses OAuth 2.0 with PKCE and requests `tweet.read`,
`tweet.write`, `users.read`, and `offline.access`. The offline scope is required
for refresh-token based scheduled publishing.

**Publishing:** SDC uses the v2 endpoint at `https://api.x.com/2/tweets`.
Text publishing is native. Media requires provider media IDs supplied by the
media-upload adapter; a raw Firebase or Cloudinary URL is never sent as if it
were an X media ID. Posts are limited to 280 characters by the readiness layer.

**Official references:**

- https://developer.x.com/en/docs/x-api
- https://developer.x.com/en/docs/x-api/tweets/manage-tweets/api-reference/post-tweets
- https://developer.x.com/en/docs/x-api/media/upload-media

### YouTube

**Connection:** SDC uses Google OAuth with `youtube.upload` and
`youtube.readonly`. The selected channel is resolved and stored as the provider
destination.

**Publishing:** The worker starts a YouTube Data API resumable upload session,
uploads the completed video, stores the returned video ID, and polls
`videos.list(part=status)` until the upload is processed or rejected. The
default visibility is private unless the user explicitly chooses another
allowed setting. Google API projects in an unverified state may have additional
privacy restrictions.

**Official references:**

- https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol
- https://developers.google.com/youtube/v3/docs/videos.insert
- https://developers.google.com/youtube/v3/docs/videos

## Scheduler/API reachability

The scheduled worker runs every five minutes for due posts. It claims a post
with a lease, resolves the selected account, validates readiness, loads the
encrypted credentials, builds the provider payload, and calls the native
publisher. Every provider call records its delivery mode, provider response,
external ID, failure code, and retryability in `socialPublishAttempts`.

The ten-minute reconciliation job polls providers that accept asynchronous
publishes, including TikTok and YouTube. The analytics job runs on its configured
interval and calls the protected provider adapter functions, which then call the
provider APIs with the decrypted access token.

Native publishing and analytics are enabled by default in the function code. A
deployed Firebase parameter explicitly set to `false` still overrides that
default; production configuration must therefore keep these values enabled:

```text
SOCIAL_NATIVE_PUBLISHING_ENABLED=true
SOCIAL_ANALYTICS_SYNC_ENABLED=true
```

For TikTok URL pulls, configure a comma-separated list of verified URL prefixes:

```text
SOCIAL_TIKTOK_VERIFIED_URL_PREFIXES=https://media.example.com/social/
```

If an external publish endpoint is used as an intentional adapter, it must
return a real provider post ID. A 2xx response without an ID is recorded as a
failure and is never marked as a published social post.

## Readiness states

The connection UI should distinguish:

- Connected: credentials exist, but provider identity or permissions still need
  checking.
- Publish ready: the token, destination, and at least one valid publish scope
  are present.
- Analytics ready: the token, destination, and analytics scopes are present.
- Permission missing: reconnect or request the provider capability.
- Needs reauth: the token is absent, expired, or rejected.

Provider app review, account type, destination role, verified media domains,
and content-specific capability approval are provider facts. They cannot be
inferred solely from an OAuth token, so SDC surfaces them as readiness warnings
and blocks unsupported scheduler work before an API call.
