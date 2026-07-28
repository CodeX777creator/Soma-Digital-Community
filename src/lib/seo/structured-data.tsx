import { absoluteUrl, SITE_NAME, SITE_URL } from "./site";

export type JsonLdValue = Record<string, unknown>;

export function organizationJsonLd(): JsonLdValue {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    alternateName: "SDC",
    url: SITE_URL,
    logo: absoluteUrl("/icon-512x512.png"),
    sameAs: [SITE_URL],
  };
}

export function websiteJsonLd(): JsonLdValue {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/marketplace?search={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

export function softwareApplicationJsonLd(): JsonLdValue {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: SITE_URL,
    description: "An AI operating system for creating, planning, publishing, learning, and growing a digital business.",
  };
}

export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>): JsonLdValue {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function courseJsonLd(input: {
  name: string;
  description: string;
  url: string;
  image?: string | null;
  provider?: string;
  priceCents?: number;
  currency?: string;
}): JsonLdValue {
  const data: JsonLdValue = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: input.name,
    description: input.description,
    url: input.url,
    provider: { "@type": "Organization", name: input.provider || SITE_NAME, sameAs: SITE_URL },
  };
  if (input.image) data.image = absoluteUrl(input.image);
  if (typeof input.priceCents === "number") {
    data.offers = {
      "@type": "Offer",
      price: Math.max(0, input.priceCents) / 100,
      priceCurrency: input.currency || "USD",
      url: input.url,
      availability: "https://schema.org/InStock",
    };
  }
  return data;
}

export function productJsonLd(input: {
  name: string;
  description: string;
  url: string;
  image?: string | null;
  priceCents?: number;
  currency?: string;
}): JsonLdValue {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: input.name,
    description: input.description,
    url: input.url,
    ...(input.image ? { image: absoluteUrl(input.image) } : {}),
    ...(typeof input.priceCents === "number"
      ? {
          offers: {
            "@type": "Offer",
            price: Math.max(0, input.priceCents) / 100,
            priceCurrency: input.currency || "USD",
            url: input.url,
            availability: "https://schema.org/InStock",
          },
        }
      : {}),
  };
}

export function eventJsonLd(input: {
  name: string;
  description: string;
  url: string;
  startDate: string;
  endDate?: string | null;
  image?: string | null;
  location?: string | null;
}): JsonLdValue {
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: input.name,
    description: input.description,
    url: input.url,
    startDate: input.startDate,
    ...(input.endDate ? { endDate: input.endDate } : {}),
    ...(input.image ? { image: absoluteUrl(input.image) } : {}),
    location: { "@type": "VirtualLocation", url: input.location || input.url },
    organizer: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
  };
}

export function faqJsonLd(items: Array<{ question: string; answer: string }>): JsonLdValue {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

export function articleJsonLd(input: {
  type?: "Article" | "BlogPosting";
  headline: string;
  description: string;
  url: string;
  author?: string;
  datePublished: string;
  dateModified?: string;
  image?: string | null;
}): JsonLdValue {
  return {
    "@context": "https://schema.org",
    "@type": input.type || "Article",
    headline: input.headline,
    description: input.description,
    url: input.url,
    author: { "@type": "Organization", name: input.author || SITE_NAME, url: SITE_URL },
    datePublished: input.datePublished,
    dateModified: input.dateModified || input.datePublished,
    ...(input.image ? { image: absoluteUrl(input.image) } : {}),
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
  };
}

export function JsonLd({ data }: { data: JsonLdValue | JsonLdValue[] }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
