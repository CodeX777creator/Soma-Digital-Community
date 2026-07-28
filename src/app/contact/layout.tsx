import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo/site";

export const metadata: Metadata = buildPageMetadata({
  title: "Contact SDC | Soma Digital Community",
  description: "Find the right way to contact Soma Digital Community for product, account, billing, privacy, and partnership questions.",
  path: "/contact",
});

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
