import type { Metadata } from "next";
import { getEventById } from "@/events";
import { absoluteUrl, buildPageMetadata } from "@/lib/seo/site";
import { breadcrumbJsonLd, eventJsonLd, JsonLd } from "@/lib/seo/structured-data";

type Props = { children: React.ReactNode; params: Promise<{ eventId: string }> };

async function getEventSafely(eventId: string) {
  try {
    return await getEventById(eventId, { tier: "explorer" });
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { eventId } = await params;
  const event = await getEventSafely(eventId);
  if (!event) return buildPageMetadata({ title: "Event Not Found", description: "This SDC event is not available.", path: `/events/${eventId}` });
  return buildPageMetadata({ title: `${event.title} | SDC Events`, description: event.description || `Join ${event.title} with Soma Digital Community.`, path: `/events/${event.eventId}`, image: event.coverImageUrl });
}

export default async function EventDetailLayout({ children, params }: Props) {
  const { eventId } = await params;
  const event = await getEventSafely(eventId);
  if (!event) return children;
  return <><JsonLd data={[eventJsonLd({ name: event.title, description: event.description || `Join ${event.title}.`, url: absoluteUrl(`/events/${event.eventId}`), startDate: event.startsAt, endDate: event.endsAt, image: event.coverImageUrl, location: event.meetingUrl }), breadcrumbJsonLd([{ name: "Events", path: "/events" }, { name: event.title, path: `/events/${event.eventId}` }])]} />{children}</>;
}
