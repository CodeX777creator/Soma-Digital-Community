import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo/site";

export const metadata: Metadata = buildPageMetadata({
  title: "Events | Live Classes, Workshops, and Replays",
  description: "Find upcoming SDC live classes, workshops, coaching calls, and replays for your digital business journey.",
  path: "/events",
});

export default function EventsLayout({ children }: { children: React.ReactNode }) { return children; }
