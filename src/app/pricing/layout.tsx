import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo/site";

export const metadata: Metadata = buildPageMetadata({ title: "Pricing | Explorer, Pro, and Elite", description: "Compare SDC plans, included Creator Credits, AI workflows, community access, and business tools.", path: "/pricing" });
export default function PricingLayout({ children }: { children: React.ReactNode }) { return children; }
