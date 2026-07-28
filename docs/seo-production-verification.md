# SEO and AEO Production Verification

Run this checklist against the deployed `www.somatoday.com` host after each public route, metadata, content, or redirect release.

## HTTP checks

From PowerShell:

```powershell
$base = "https://www.somatoday.com"
Invoke-WebRequest "$base/robots.txt" -UseBasicParsing | Select-Object StatusCode,Headers,Content
Invoke-WebRequest "$base/sitemap.xml" -UseBasicParsing | Select-Object StatusCode,Headers,Content
Invoke-WebRequest "$base/manifest.json" -UseBasicParsing | Select-Object StatusCode,Headers,Content
Invoke-WebRequest "$base/academy" -UseBasicParsing | Select-Object StatusCode,Headers,Content
```

Expected results:

- `robots.txt`: `200`, plain text, contains the sitemap URL and private/API disallows.
- `sitemap.xml`: `200`, XML, contains only public canonical URLs.
- `manifest.json`: `200`, JSON, with valid icons.
- Public HTML: `200`, includes a canonical link, a useful title, one primary H1, and no login requirement.

## Canonical and metadata matrix

Check at least one URL from each row:

| Surface | Canonical expectation | Structured data |
| --- | --- | --- |
| Homepage | `https://www.somatoday.com/` | Organization, WebSite, SoftwareApplication, visible FAQ when present |
| Academy course | `/academy/{courseSlug}` | Course, Offer when price is visible, BreadcrumbList |
| Marketplace product | `/marketplace/{productSlug}` | Product, Offer when price is visible, BreadcrumbList |
| Event | `/events/{eventId}` | Event, VirtualLocation, BreadcrumbList |
| Blog article | `/blog/{slug}` | BlogPosting, BreadcrumbList |
| Case study | `/case-studies/{slug}` | Article, BreadcrumbList |

For every URL, verify that the Open Graph URL and canonical match, the image returns `200`, the title is unique, and the description is specific to the page.

## Protected-route checks

Confirm that these routes return `noindex` metadata or `X-Robots-Tag: noindex` and do not expose private records in server-rendered HTML:

`/open`, `/login`, `/signup`, `/dashboard`, `/settings`, `/profile`, `/admin`, `/ai`, `/mentor`, `/social`, `/community`, `/reseller`, `/my-courses`, `/notifications`, `/tools`, private Academy learning/quiz/exam routes, and `/api`.

Use an unauthenticated browser session and confirm that private content is not present in the HTML response. Do not rely only on client-side redirects.

## Redirect checks

```powershell
Invoke-WebRequest "$base/marketplace?asset=example&ref=test" -MaximumRedirection 0 -ErrorAction SilentlyContinue | Select-Object StatusCode,Headers
```

Expected behavior is a permanent redirect to the clean Marketplace product URL, with referral attribution preserved only when the product exists and the referral is valid. Renamed or archived content should resolve through an intentional redirect or a clear 404, never a duplicate indexable page.

## Browser and performance checks

Run Lighthouse against the homepage and one page from each public surface:

```text
npx lighthouse https://www.somatoday.com/ --only-categories=seo,performance,accessibility --view
```

Verify:

- Lighthouse SEO is at least 95 for public pages.
- No horizontal overflow at 320px, 390px, 768px, and desktop widths.
- Public content appears without waiting for Firebase authentication or client-only data.
- Hero images have dimensions and do not cause layout shift.
- Below-the-fold images are lazy-loaded; the primary image is prioritized appropriately.
- Mobile navigation, breadcrumbs, CTA links, and structured content remain usable.

## Search-platform follow-up

After deployment, inspect the release in [Google Search Console](https://search.google.com/search-console) and [Bing Webmaster Tools](https://www.bing.com/webmasters):

1. Submit or resubmit `sitemap.xml` only when the sitemap URL changes or a major catalog migration occurs.
2. Inspect the homepage and one new public URL with the live URL test.
3. Check URL coverage, Core Web Vitals, crawl errors, and structured-data reports.
4. Record any newly excluded public URL and its reason.
5. Compare branded and non-branded query performance after enough data has accumulated.

## Release sign-off

- [ ] Public routes render without authentication.
- [ ] Canonicals use `www.somatoday.com`.
- [ ] Sitemap contains only published public records.
- [ ] Draft, archived, paid-only learner, and user-specific URLs are excluded.
- [ ] Robots and noindex behavior is correct.
- [ ] JSON-LD parses and matches visible content.
- [ ] Images have meaningful alt text and stable dimensions.
- [ ] Legacy URLs redirect without creating chains.
- [ ] No private data appears in public HTML.
