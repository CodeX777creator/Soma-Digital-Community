import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo/site";

export const metadata: Metadata = buildPageMetadata({
  title: "Academy | Learn, Certify, and Build",
  description: "Explore practical Academy courses, complete structured lessons, and earn certificates that support your digital business journey.",
  path: "/academy",
});

export default function AcademyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
