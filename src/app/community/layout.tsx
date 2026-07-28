import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo/site";

export const metadata: Metadata = buildPageMetadata({
  title: "Global Community | Soma Digital",
  description: "Connect with successful owners, share wins, and grow your business with the community.",
  path: "/community",
});

export default function CommunityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
