import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Global Community | Soma Digital",
  description: "Connect with successful owners, share wins, and grow your business with the community.",
  openGraph: {
    title: "Global Community | Soma Digital",
    description: "The central hub for business growth and networking.",
    type: "website",
  },
};

export default function CommunityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
