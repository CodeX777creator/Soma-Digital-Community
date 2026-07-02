"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { Copy, ExternalLink, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { useAuth } from "@/providers/AuthProvider";
import { authFetch } from "@/lib/clientApi";
import { db } from "@/lib/firebase";
import { getAssetById, type MarketplaceAsset } from "@/lib/marketplace";
import { useToast } from "@/hooks/use-toast";

type PurchaseRecord = {
  id: string;
  userId: string;
  assetId: string;
  assetTitle: string;
  status: string;
  licenseType: "standard" | "mrr";
  resaleRights: boolean;
  purchasedAt?: any;
  paidAt?: any;
};

type CourseItem = {
  purchase: PurchaseRecord;
  asset: MarketplaceAsset | null;
  resellerLink?: string;
};

function normalizePurchase(id: string, data: Record<string, any>): PurchaseRecord {
  return {
    id,
    userId: data.userId || data.uid || "",
    assetId: data.assetId || "",
    assetTitle: data.assetTitle || "Purchased course",
    status: data.status || "pending",
    licenseType: data.licenseType === "mrr" ? "mrr" : "standard",
    resaleRights: data.resaleRights === true,
    purchasedAt: data.purchasedAt || data.createdAt || null,
    paidAt: data.paidAt || null,
  };
}

export default function MyCoursesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadCourses() {
      if (!user?.uid || !db) return;
      const firestore = db;
      setLoading(true);

      try {
        const snapshot = await getDocs(query(collection(firestore, "assetPurchases"), where("userId", "==", user.uid)));
        const purchases = snapshot.docs.map((item) => normalizePurchase(item.id, item.data()));
        const loadedCourses = await Promise.all(
          purchases.map(async (purchase) => {
            const [asset, linkSnap] = await Promise.all([
              purchase.assetId ? getAssetById(purchase.assetId) : Promise.resolve(null),
              purchase.assetId ? getDoc(doc(firestore, "resellerLinks", `${user.uid}_${purchase.assetId}`)) : Promise.resolve(null),
            ]);
            return {
              purchase,
              asset,
              resellerLink: linkSnap?.exists() ? linkSnap.data()?.url : "",
            };
          })
        );

        if (!cancelled) {
          setCourses(loadedCourses.sort((a, b) => Number(b.purchase.paidAt?.seconds || 0) - Number(a.purchase.paidAt?.seconds || 0)));
        }
      } catch (error) {
        console.error("Unable to load purchased courses:", error);
        toast({ title: "Unable to load courses", description: "Please refresh and try again." });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadCourses();
    return () => {
      cancelled = true;
    };
  }, [toast, user?.uid]);

  const paidCourses = useMemo(() => courses.filter((item) => item.purchase.status === "paid"), [courses]);

  const openCourse = async (item: CourseItem) => {
    setOpeningId(item.purchase.id);
    try {
      const response = await authFetch("/api/marketplace/asset-access", {
        method: "POST",
        body: JSON.stringify({ assetId: item.purchase.assetId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Unable to open course");

      const instructions = [payload.asset?.accessInstructions, payload.asset?.websiteOnboardingInstructions]
        .filter(Boolean)
        .join("\n\n");
      if (instructions) {
        toast({ title: payload.asset?.externalPlatform || "Course access", description: instructions });
      }
      if (payload.assetUrl) window.open(payload.assetUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast({ title: "Unable to open course", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setOpeningId(null);
    }
  };

  const copyResellerLink = async (item: CourseItem) => {
    try {
      let url = item.resellerLink || "";
      if (!url) {
        const response = await authFetch("/api/marketplace/reseller-link", {
          method: "POST",
          body: JSON.stringify({ assetId: item.purchase.assetId }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || "Unable to create reseller link");
        url = payload.resellerLink?.url || "";
        setCourses((current) =>
          current.map((course) => course.purchase.id === item.purchase.id ? { ...course, resellerLink: url } : course)
        );
      }
      await navigator.clipboard.writeText(url);
      toast({ title: "Reseller link copied", description: url });
    } catch (error) {
      toast({ title: "Unable to copy link", description: error instanceof Error ? error.message : "Please try again." });
    }
  };

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="space-y-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="font-headline text-4xl font-bold tracking-tight">My Courses</h1>
              <p className="mt-2 text-muted-foreground">Purchased courses, course links, and MRR resale access.</p>
            </div>
            <Button asChild variant="ghost" className="border border-white/10 bg-white/5">
              <Link href="/reseller">Reseller Dashboard</Link>
            </Button>
          </div>

          {loading && (
            <GlassCard className="p-8 text-center text-muted-foreground">
              <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin text-primary" />
              Loading courses
            </GlassCard>
          )}

          {!loading && paidCourses.length === 0 && (
            <GlassCard className="p-10 text-center">
              <p className="font-semibold">No purchased courses yet.</p>
              <p className="mt-2 text-sm text-muted-foreground">Courses you purchase through SDC will appear here.</p>
              <Button asChild className="mt-5">
                <Link href="/marketplace">Browse Marketplace</Link>
              </Button>
            </GlassCard>
          )}

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {paidCourses.map((item) => {
              const asset = item.asset;
              return (
                <GlassCard key={item.purchase.id} className="flex h-full flex-col overflow-hidden p-0">
                  <div className="aspect-[16/9] bg-white/5">
                    {asset?.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={asset.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-white/35">Course</div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-5 p-5">
                    <div className="flex-1">
                      <div className="mb-3 flex flex-wrap gap-2">
                        <Badge className="bg-emerald-400/15 text-emerald-200">{item.purchase.status}</Badge>
                        <Badge className={item.purchase.licenseType === "mrr" ? "bg-cyan-400 text-black" : "bg-white/10 text-white"}>
                          {item.purchase.licenseType === "mrr" ? "MRR" : "Standard"}
                        </Badge>
                      </div>
                      <h2 className="text-xl font-bold">{asset?.title || item.purchase.assetTitle}</h2>
                      <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{asset?.description || "Course purchased through SDC."}</p>
                    </div>
                    <div className="grid gap-2">
                      <Button onClick={() => openCourse(item)} disabled={openingId === item.purchase.id}>
                        {openingId === item.purchase.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                        Open Course
                      </Button>
                      {item.purchase.resaleRights && (
                        <Button onClick={() => copyResellerLink(item)} variant="ghost" className="border border-white/10 bg-white/5">
                          <Copy className="h-4 w-4" />
                          Copy Reseller Link
                        </Button>
                      )}
                      {item.purchase.resaleRights && (
                        <Button asChild variant="link" className="text-cyan-300">
                          <Link href="/reseller">
                            <ShieldCheck className="h-4 w-4" />
                            View reseller stats
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>
                </GlassCard>
              );
            })}
          </div>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}
