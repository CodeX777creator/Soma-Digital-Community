import { NextRequest } from "next/server";
import { apiResponse, createAPIHandler } from "@/lib/api-middleware";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireSubscription } from "@/lib/serverAuth";

type FirestoreDoc = Record<string, any>;

function toIso(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000).toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function dollarsToCents(value: unknown) {
  return Math.round(numberValue(value) * 100);
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function normalizeStatus(value: unknown) {
  return typeof value === "string" && value ? value : "unknown";
}

async function getDocsByIds(collectionName: string, ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  const entries = await Promise.all(uniqueIds.map(async (id) => {
    const snap = await adminDb.collection(collectionName).doc(id).get();
    return [id, snap.exists ? { id: snap.id, ...snap.data() } : null] as const;
  }));
  return Object.fromEntries(entries.filter(([, value]) => Boolean(value))) as Record<string, FirestoreDoc>;
}

function getDisplayTitle(link: FirestoreDoc, courses: Record<string, FirestoreDoc>, assets: Record<string, FirestoreDoc>) {
  const itemId = stringValue(link.courseId || link.assetId);
  const source = link.itemType === "academy_course" ? courses[itemId] : assets[itemId];
  return stringValue(source?.title, link.itemType === "academy_course" ? "Academy course" : "Marketplace product");
}

function getThumbnail(link: FirestoreDoc, courses: Record<string, FirestoreDoc>, assets: Record<string, FirestoreDoc>) {
  const itemId = stringValue(link.courseId || link.assetId);
  const source = link.itemType === "academy_course" ? courses[itemId] : assets[itemId];
  return stringValue(source?.thumbnailUrl || source?.imageUrl || source?.coverImageUrl);
}

function getLinkHealth(link: FirestoreDoc, courses: Record<string, FirestoreDoc>, assets: Record<string, FirestoreDoc>) {
  if (link.active === false) {
    return { status: "paused", label: "Paused", detail: "This reseller link is currently paused." };
  }

  const itemId = stringValue(link.courseId || link.assetId);
  const source = link.itemType === "academy_course" ? courses[itemId] : assets[itemId];
  if (!source) {
    return { status: "warning", label: "Item unavailable", detail: "The linked item could not be found." };
  }

  if (link.itemType === "academy_course" && source.status !== "published") {
    return { status: "warning", label: "Course unpublished", detail: "Publish the Academy course before sharing this link." };
  }

  if (link.itemType !== "academy_course" && source.published === false) {
    return { status: "warning", label: "Product unpublished", detail: "Publish the Marketplace product before sharing this link." };
  }

  return { status: "healthy", label: "Ready to share", detail: "This reseller link points to an available item." };
}

function buildSetupSteps(input: {
  hasCourseCompletion: boolean;
  hasCertificate: boolean;
  hasMrrPurchase: boolean;
  hasLink: boolean;
  hasPayoutProfile: boolean;
  hasSale: boolean;
}) {
  return [
    {
      key: "complete_course",
      label: "Complete course",
      description: "Finish the certification course connected to your reseller rights.",
      complete: input.hasCourseCompletion || input.hasCertificate,
      href: "/academy",
    },
    {
      key: "earn_certificate",
      label: "Earn certificate",
      description: "Pass the final exam so the course can be represented confidently.",
      complete: input.hasCertificate,
      href: "/academy/certificates",
    },
    {
      key: "buy_mrr",
      label: "Buy Master Resell Rights",
      description: "Purchase course MRR or an eligible Marketplace reseller license.",
      complete: input.hasMrrPurchase,
      href: "/my-courses",
    },
    {
      key: "create_link",
      label: "Create reseller link",
      description: "Generate a tracked link for each resale-enabled item.",
      complete: input.hasLink,
      href: "/my-courses",
    },
    {
      key: "add_payout",
      label: "Add payout details",
      description: "Tell admins where commissions should be paid.",
      complete: input.hasPayoutProfile,
      href: "/reseller#payout",
    },
    {
      key: "share_link",
      label: "Share your link",
      description: "Share on WhatsApp, social platforms, email, or your website.",
      complete: input.hasSale,
      href: "/reseller#links",
    },
    {
      key: "first_sale",
      label: "Make first sale",
      description: "Your sales history and commission status will appear here.",
      complete: input.hasSale,
      href: "/reseller#sales",
    },
  ];
}

export const GET = createAPIHandler(
  async (req: NextRequest) => {
    const entitlements = await requireSubscription(req as any, "explorer");
    const uid = entitlements.uid;

    const [
      linksSnap,
      salesSnap,
      payoutSnap,
      certificatesSnap,
      mrrPurchasesSnap,
      mrrEligibilitySnap,
      academyLicensesSnap,
      enrollmentsSnap,
      clicksSnap,
    ] = await Promise.all([
      adminDb.collection("resellerLinks").where("userId", "==", uid).get(),
      adminDb.collection("resellerSales").where("resellerUserId", "==", uid).get(),
      adminDb.collection("resellerPayoutProfiles").doc(uid).get(),
      adminDb.collection("academyCertificates").where("userId", "==", uid).get(),
      adminDb.collection("academyMrrPurchases").where("userId", "==", uid).get(),
      adminDb.collection("academyMrrEligibility").where("userId", "==", uid).get(),
      adminDb.collection("academyResellerLicenses").where("userId", "==", uid).get(),
      adminDb.collection("academyEnrollments").where("userId", "==", uid).get(),
      adminDb.collection("resellerLinkClicks").where("resellerUserId", "==", uid).limit(1000).get(),
    ]);

    const rawLinks: FirestoreDoc[] = linksSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const rawSales: FirestoreDoc[] = salesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const payoutProfile = payoutSnap.exists ? payoutSnap.data() || {} : null;

    const courseIds = Array.from(new Set(rawLinks
      .filter((link) => link.itemType === "academy_course")
      .map((link) => stringValue(link.courseId || link.assetId))
      .filter(Boolean)));
    const assetIds = Array.from(new Set([
      ...rawLinks
        .filter((link) => link.itemType !== "academy_course")
        .map((link) => stringValue(link.assetId)),
      ...rawSales.map((sale) => stringValue(sale.assetId)),
    ].filter(Boolean)));
    const buyerIds = Array.from(new Set(rawSales.map((sale) => stringValue(sale.buyerUserId)).filter(Boolean)));

    const [courses, assets, buyers] = await Promise.all([
      getDocsByIds("academyCourses", courseIds),
      getDocsByIds("marketplaceAssets", assetIds),
      getDocsByIds("users", buyerIds),
    ]);

    const links = rawLinks
      .map((link) => {
        const itemType = link.itemType === "academy_course" ? "academy_course" : "marketplace_product";
        const itemId = stringValue(itemType === "academy_course" ? link.courseId || link.assetId : link.assetId);
        return {
          id: stringValue(link.id),
          itemType,
          itemId,
          title: getDisplayTitle(link, courses, assets),
          thumbnailUrl: getThumbnail(link, courses, assets),
          slug: stringValue(link.slug),
          url: stringValue(link.url),
          active: link.active !== false,
          resalePriceCents: itemType === "academy_course"
            ? numberValue(link.resalePrice || link.priceCents)
            : dollarsToCents(link.resalePrice || link.price),
          commissionType: stringValue(link.resellerCommissionType, "percentage"),
          commissionValue: numberValue(link.resellerCommissionValue),
          clickCount: numberValue(link.clickCount),
          health: getLinkHealth(link, courses, assets),
          createdAt: toIso(link.createdAt),
          updatedAt: toIso(link.updatedAt),
        };
      })
      .sort((a, b) => Number(new Date(b.createdAt || 0)) - Number(new Date(a.createdAt || 0)));

    const sales = rawSales
      .map((sale) => {
        const buyer = buyers[stringValue(sale.buyerUserId)] || {};
        const item = courses[stringValue(sale.assetId)] || assets[stringValue(sale.assetId)] || {};
        const itemType = sale.itemType === "academy_course" || courses[stringValue(sale.assetId)] ? "academy_course" : "marketplace_product";
        return {
          id: stringValue(sale.id),
          itemType,
          buyerUserId: stringValue(sale.buyerUserId),
          buyerName: stringValue(buyer.name || buyer.displayName, "Buyer"),
          buyerEmail: stringValue(buyer.email),
          itemId: stringValue(sale.assetId),
          itemTitle: stringValue(item.title, stringValue(sale.assetId, "Reseller item")),
          purchaseId: stringValue(sale.purchaseId),
          grossAmountCents: dollarsToCents(sale.grossAmount),
          resellerEarningsCents: dollarsToCents(sale.resellerEarnings),
          status: normalizeStatus(sale.status),
          paystackReference: stringValue(sale.paystackReference),
          createdAt: toIso(sale.createdAt),
          paidAt: toIso(sale.paidAt),
        };
      })
      .sort((a, b) => Number(new Date(b.createdAt || 0)) - Number(new Date(a.createdAt || 0)));

    const pendingPayoutCents = sales
      .filter((sale) => sale.status !== "paid")
      .reduce((sum, sale) => sum + sale.resellerEarningsCents, 0);
    const paidEarningsCents = sales
      .filter((sale) => sale.status === "paid")
      .reduce((sum, sale) => sum + sale.resellerEarningsCents, 0);

    const hasPayoutProfile = Boolean(payoutProfile?.method && payoutProfile?.accountName && payoutProfile?.accountDetails);
    const clickCount = clicksSnap.size || rawLinks.reduce((sum, link) => sum + numberValue(link.clickCount), 0);
    const payoutReadiness = !hasPayoutProfile
      ? {
          status: "missing",
          label: "Payout details needed",
          detail: "Add your payout method and account details before commissions can be paid.",
          blocking: true,
        }
      : payoutProfile?.status === "pending_review"
        ? {
            status: "pending_review",
            label: "Payout profile under review",
            detail: "Admins can review and approve your payout details before payment.",
            blocking: false,
          }
        : {
            status: pendingPayoutCents > 0 ? "ready" : "saved",
            label: pendingPayoutCents > 0 ? "Ready for payout review" : "Payout details saved",
            detail: pendingPayoutCents > 0 ? "You have commissions that can be reviewed for payout." : "Your payout details are ready for future sales.",
            blocking: false,
          };

    const setupSteps = buildSetupSteps({
      hasCourseCompletion: enrollmentsSnap.docs.some((doc) => {
        const data = doc.data();
        return data.status === "completed" || data.completed === true || data.progressPercent === 100;
      }),
      hasCertificate: !certificatesSnap.empty,
      hasMrrPurchase: !mrrPurchasesSnap.empty || academyLicensesSnap.docs.some((doc) => doc.data()?.status === "active"),
      hasLink: links.length > 0,
      hasPayoutProfile,
      hasSale: sales.length > 0,
    });

    return apiResponse({
      totals: {
        totalEarningsCents: pendingPayoutCents + paidEarningsCents,
        pendingPayoutCents,
        paidEarningsCents,
        salesCount: sales.length,
        buyersCount: new Set(sales.map((sale) => sale.buyerUserId).filter(Boolean)).size,
        activeLinksCount: links.filter((link) => link.active).length,
        linkClicksCount: clickCount,
        conversionRate: clickCount > 0 ? Number(((sales.length / clickCount) * 100).toFixed(1)) : null,
      },
      payoutProfile: payoutProfile ? {
        method: stringValue(payoutProfile.method),
        accountName: stringValue(payoutProfile.accountName),
        accountDetails: stringValue(payoutProfile.accountDetails),
        country: stringValue(payoutProfile.country),
        currency: stringValue(payoutProfile.currency, "USD"),
        status: stringValue(payoutProfile.status, "saved"),
        updatedAt: toIso(payoutProfile.updatedAt),
      } : null,
      payoutReadiness,
      eligibility: {
        certificatesCount: certificatesSnap.size,
        eligibleMrrCount: mrrEligibilitySnap.size,
        activeLicenseCount: academyLicensesSnap.docs.filter((doc) => doc.data()?.status === "active").length,
        mrrPurchasesCount: mrrPurchasesSnap.size,
        setupSteps,
        nextAction: setupSteps.find((step) => !step.complete) || null,
      },
      links,
      sales,
    }, {
      cache: { maxAge: 15, staleWhileRevalidate: 30, private: true },
    });
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 30 },
    timeout: 20000,
  }
);
