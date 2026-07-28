import type { Metadata } from "next";
import { getPublishedAcademyCourseBySlug } from "@/academy";
import { absoluteUrl, buildPageMetadata } from "@/lib/seo/site";
import { breadcrumbJsonLd, courseJsonLd, JsonLd } from "@/lib/seo/structured-data";

type Props = { children: React.ReactNode; params: Promise<{ courseSlug: string }> };

async function getCourseSafely(slug: string) {
  try {
    return await getPublishedAcademyCourseBySlug(slug);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { courseSlug } = await params;
  const course = await getCourseSafely(courseSlug);
  if (!course) return buildPageMetadata({ title: "Course Not Found", description: "This Academy course is not available.", path: `/academy/${courseSlug}` });
  return buildPageMetadata({
    title: `${course.title} | Academy`,
    description: course.description || `Learn practical skills with ${course.title} from Soma Digital Community Academy.`,
    path: `/academy/${course.slug}`,
    image: course.thumbnailUrl,
  });
}

export default async function AcademyCourseLayout({ children, params }: Props) {
  const { courseSlug } = await params;
  const course = await getCourseSafely(courseSlug);
  const data = course
    ? [
        courseJsonLd({
          name: course.title,
          description: course.description || `Learn practical skills with ${course.title}.`,
          url: absoluteUrl(`/academy/${course.slug}`),
          image: course.thumbnailUrl,
          priceCents: course.pricingType === "free" ? 0 : course.salePriceCents ?? course.priceCents,
          currency: course.currency,
        }),
        breadcrumbJsonLd([{ name: "Academy", path: "/academy" }, { name: course.title, path: `/academy/${course.slug}` }]),
      ]
    : null;
  return <>{data ? <JsonLd data={data} /> : null}{children}</>;
}
