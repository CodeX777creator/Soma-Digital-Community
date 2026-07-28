import type { Metadata } from "next";

export const SITE_NAME = "Soma Digital Community";
export const SITE_SHORT_NAME = "SDC";
export const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.somatoday.com";
export const DEFAULT_DESCRIPTION =
  "Soma Digital Community is an AI operating system for digital entrepreneurs to create, plan, publish, learn, and grow.";
export const DEFAULT_OG_IMAGE = "/founder-primary.png";

export function absoluteUrl(path = "/") {
  return new URL(path, SITE_URL).toString();
}

export function buildPageMetadata(input: {
  title: string;
  description: string;
  path?: string;
  image?: string | null;
  type?: "website" | "article";
  publishedTime?: string | null;
  modifiedTime?: string | null;
}): Metadata {
  const url = absoluteUrl(input.path || "/");
  const image = absoluteUrl(input.image || DEFAULT_OG_IMAGE);

  return {
    title: { absolute: input.title },
    description: input.description,
    alternates: { canonical: url },
    openGraph: {
      title: input.title,
      description: input.description,
      url,
      siteName: SITE_NAME,
      type: input.type || "website",
      images: [{ url: image, width: 1200, height: 630, alt: input.title }],
      ...(input.type === "article"
        ? {
            publishedTime: input.publishedTime || undefined,
            modifiedTime: input.modifiedTime || undefined,
          }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: input.title,
      description: input.description,
      images: [image],
    },
  };
}

export function noIndexMetadata(): Metadata {
  return { robots: { index: false, follow: false } };
}
