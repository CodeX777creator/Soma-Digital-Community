import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo/site";

export const metadata: Metadata = buildPageMetadata({
  title: "About SDC | Soma Digital Community",
  description: "Learn what Soma Digital Community is, who it serves, and how its AI, learning, community, and commerce tools fit together.",
  path: "/about",
});

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
