import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo/site";

export const metadata: Metadata = buildPageMetadata({ title: "Privacy Policy | Soma Digital", description: "Read how Soma Digital Community handles account, content, payment, and platform data.", path: "/privacy" });
export default function PrivacyLayout({ children }: { children: React.ReactNode }) { return children; }
