import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures: string[] = [];

function read(relativePath: string) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`Missing ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function assert(condition: boolean, message: string) {
  if (!condition) failures.push(message);
}

const routes = read("src/lib/seo/routes.ts");
const site = read("src/lib/seo/site.ts");
const structuredData = read("src/lib/seo/structured-data.tsx");
const sitemap = read("src/app/sitemap.ts");
const content = read("src/lib/seo/content.ts");
const robots = read("src/app/robots.ts");
const middleware = read("src/middleware.ts");

assert(site.includes("https://www.somatoday.com"), "SEO site config must define the www production URL.");
assert(routes.includes('"/about"') && routes.includes('"/contact"'), "Trust routes must be indexable.");
assert(routes.includes('"/community"'), "Protected community route must be noindex.");
assert(structuredData.includes("articleJsonLd"), "Article structured-data helper is missing.");
assert(structuredData.includes("faqJsonLd"), "FAQ structured-data helper is missing.");
assert(sitemap.includes("BLOG_ARTICLES") && sitemap.includes("CASE_STUDIES"), "Sitemap must include public article and case-study entries.");
assert(content.includes("export const BLOG_ARTICLES") && content.includes("export const CASE_STUDIES"), "Public SEO content collections are missing.");
assert(robots.includes("sitemap.xml") && robots.includes("/api/"), "Robots policy must expose the sitemap and block API routes.");
assert(middleware.includes("url.pathname === '/marketplace'") && middleware.includes("NextResponse.redirect"), "Legacy Marketplace URLs must redirect to clean product routes.");

for (const relativePath of [
  "src/app/blog/page.tsx",
  "src/app/blog/[slug]/page.tsx",
  "src/app/case-studies/page.tsx",
  "src/app/case-studies/[slug]/page.tsx",
  "src/app/about/page.tsx",
  "src/app/contact/page.tsx",
]) {
  const source = read(relativePath);
  assert((source.match(/<h1\b/g) || []).length === 1, `${relativePath} must contain exactly one H1.`);
}

for (const relativePath of ["src/app/academy/page.tsx", "src/app/events/page.tsx", "src/app/marketplace/[assetId]/page.tsx"]) {
  const source = read(relativePath);
  assert(!source.includes('alt=""'), `${relativePath} contains an empty image alt attribute.`);
}

if (failures.length) {
  console.error("SEO validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("SEO validation passed: public routes, metadata helpers, sitemap, redirects, and image alt checks are present.");
