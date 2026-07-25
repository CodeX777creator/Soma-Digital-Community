import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/serverAuth";
import { apiResponse, createAPIHandler } from "@/lib/api-middleware";
import { sanitizeString } from "@/lib/security";

type GifResult = {
  id: string;
  url: string;
  previewUrl: string;
  title: string;
};

type MediaKind = "gif" | "sticker";

function limitValue(value: string | null): number {
  const parsed = Number(value || 12);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.floor(parsed), 1), 24) : 12;
}

async function searchGiphy(query: string, limit: number, key: string, kind: MediaKind): Promise<GifResult[]> {
  const params = new URLSearchParams({
    api_key: key,
    q: query || "trending",
    limit: String(limit),
    rating: "pg-13",
  });
  const endpoint = kind === "sticker" ? "stickers" : "gifs";
  const response = await fetch(`https://api.giphy.com/v1/${endpoint}/search?${params.toString()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Giphy request failed (${response.status})`);
  const payload = await response.json();
  return Array.isArray(payload?.data)
    ? payload.data.map((item: Record<string, unknown>) => {
        const images = item.images as Record<string, Record<string, unknown>> | undefined;
        const original = images?.original;
        const preview = images?.fixed_width || original;
        return {
          id: String(item.id || ""),
          url: typeof original?.url === "string" ? original.url : "",
          previewUrl: typeof preview?.url === "string" ? preview.url : typeof original?.url === "string" ? original.url : "",
          title: typeof item.title === "string" && item.title ? item.title : "Community GIF",
        };
      }).filter((item: GifResult) => item.url.startsWith("https://media.giphy.com/") || item.url.startsWith("https://i.giphy.com/"))
    : [];
}

export const GET = createAPIHandler(
  async (req: NextRequest) => {
    await requireAuth(req);
    const url = new URL(req.url);
    const query = sanitizeString(url.searchParams.get("q") || "", 80);
    const limit = limitValue(url.searchParams.get("limit"));
    const kind: MediaKind = url.searchParams.get("kind") === "sticker" ? "sticker" : "gif";
    const giphyKey = process.env.GIPHY_API_KEY?.trim();

    if (giphyKey) {
      return apiResponse({ gifs: await searchGiphy(query, limit, giphyKey, kind), provider: "giphy", kind });
    }

    return apiResponse({ gifs: [], provider: null, configured: false, kind });
  },
  { rateLimit: { windowMs: 60 * 1000, maxRequests: 30 }, timeout: 15000 }
);
