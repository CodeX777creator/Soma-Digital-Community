import type { Metadata } from "next";
import { noIndexMetadata } from "@/lib/seo/site";

export const metadata: Metadata = noIndexMetadata();
export default function AcademyQuizLayout({ children }: { children: React.ReactNode }) { return children; }
