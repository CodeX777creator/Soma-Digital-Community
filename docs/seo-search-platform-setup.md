# SDC SEO and AEO Measurement Setup

This runbook covers the production setup for Soma Digital Community at `https://www.somatoday.com`. It assumes that public catalog and content routes are indexable, while account, learning, billing, admin, AI, community, and operational routes are protected with `noindex` rules.

## 1. Google Search Console

1. Open [Google Search Console](https://search.google.com/search-console) and select **Add property**.
2. Add the **Domain** property `somatoday.com` when DNS access is available. This covers `www`, the root domain, and future subdomains.
3. If DNS verification is not available, add the URL-prefix property `https://www.somatoday.com/` and use the HTML or DNS verification method Google provides.
4. Confirm that the verified property uses the production `www` hostname. Do not submit a preview, admin, or localhost host.
5. Open **Sitemaps**, enter `sitemap.xml`, and submit it. The full URL should resolve to `https://www.somatoday.com/sitemap.xml`.
6. Use **URL inspection** for one example of every public type:
   - `/`
   - `/academy`
   - `/academy/{courseSlug}`
   - `/marketplace`
   - `/marketplace/{productSlug}`
   - `/events`
   - `/events/{eventId}`
   - `/blog/{slug}`
   - `/case-studies/{slug}`
7. Select **Test live URL** and confirm that the page is accessible, canonicalized to the `www` URL, and does not require authentication.
8. Use **Indexing > Pages** weekly. Review **Indexed**, **Not indexed**, and **Crawled - currently not indexed** separately. Protected routes and intentional redirects should be excluded; unexpected public exclusions require investigation.
9. Use **Experience > Core Web Vitals** to review mobile and desktop URL groups. Prioritize URLs with poor LCP, CLS, or INP before adding more client-side UI.
10. Use **Enhancements** and the **Rich results** report to review Course, Product, Event, Article, Breadcrumb, Organization, and FAQ eligibility. Structured data must describe content that is visibly present on the page.

### Search Console query reporting

In **Performance > Search results**, set a 3-month comparison and export the report. Track:

- Total clicks, impressions, CTR, and average position.
- Queries containing `soma`, `somatoday`, or `soma digital` as branded queries.
- All other queries as non-branded queries.
- Landing pages by surface: Academy, Marketplace, Events, Blog, and Case Studies.
- Search appearance changes after publishing or metadata updates.

## 2. Bing Webmaster Tools

1. Open [Bing Webmaster Tools](https://www.bing.com/webmasters) and sign in.
2. Add `https://www.somatoday.com/` as a site. Import the verified Google Search Console property where available, or complete DNS/XML/HTML verification.
3. Open **Sitemaps** and submit `https://www.somatoday.com/sitemap.xml`.
4. Use **URL Inspection** for the same public route sample used in Search Console.
5. Review **Site Scan**, crawl errors, blocked resources, and sitemap processing status.
6. Review **Search Performance** for query, page, country, and device trends. Export the report monthly for comparison.

## 3. Analytics and referral measurement

Use the analytics property already approved for SDC. Do not add a second tracker just for SEO.

Track these events or equivalent product analytics events:

- `public_page_view` with `surface` and canonical path.
- `public_cta_click` with source page and destination.
- `academy_course_view`, `marketplace_product_view`, and `event_view`.
- `signup_started` and `signup_completed`.
- `sitemap_discovery` and `search_landing` if server-side analytics is available.

Capture the referrer host and classify it as:

- Search: Google, Bing, DuckDuckGo, or another search engine.
- AI referral: a known AI answer product or assistant referrer when the browser supplies one.
- Social, partner, email, direct, or unknown.

Do not store full user prompts, private page content, access tokens, or sensitive query strings in analytics. Strip `ref` reseller parameters from canonical URLs while preserving them only in the attribution flow.

## 4. 404 and redirect monitoring

Review Vercel request logs and Search Console **Not found (404)** weekly. Group failures by:

- A real public page that needs a redirect.
- A typo or malicious crawler request that should stay 404.
- A renamed course, product, event, article, or case study.
- A private route that should remain protected.

Legacy Marketplace URLs such as `/marketplace?asset=...` should redirect permanently to `/marketplace/{productSlug}` or the supported product identifier. Referral attribution may remain in `?ref=...`; it must not change the canonical URL.

## 5. Structured-data and AEO checks

1. Run [Google Rich Results Test](https://search.google.com/test/rich-results) against public Academy, Marketplace, Event, Blog, and Case Study URLs.
2. Run [Schema Markup Validator](https://validator.schema.org/) for a page when Rich Results Test reports a parsing issue.
3. Confirm that visible FAQ answers match FAQ JSON-LD exactly enough for a reviewer to understand the relationship.
4. Confirm that price, availability, author, date, image, and course/product claims are current and visible.
5. Review the page as an answer engine would: the first paragraph should directly answer the page topic, headings should be descriptive, and related links should lead to the next useful action.

## 6. Monthly operating checklist

- Submit or inspect the latest sitemap after major catalog changes.
- Review index coverage and crawl errors.
- Review Core Web Vitals and public page Lighthouse scores.
- Test one canonical, robots, Open Graph, Twitter, and JSON-LD response.
- Review branded versus non-branded query performance.
- Review public 404s and redirect chains.
- Check AI referral traffic when referrer data is available.
- Archive the exported reports with the deployment date.
