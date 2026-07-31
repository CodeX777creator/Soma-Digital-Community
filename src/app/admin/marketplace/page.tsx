"use client";

import React, { FormEvent, useEffect, useId, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import {
  Edit,
  ImageIcon,
  Loader2,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { AdminMediaPicker } from "@/components/admin/AdminMediaPicker";

type AssetType = "pdf" | "video" | "template" | "notion" | "link" | "code" | "external_course";
type AssetTier = "free" | "pro" | "elite";
type LicenseType = "standard" | "mrr";
type CommissionType = "fixed" | "percentage";
type CommissionBase = "full_price" | "course_price";
type DeliveryType = "download" | "external_access" | "hybrid";
type PricingType = "free" | "paid" | "included_with_plan" | "promo_only";
type ExternalAccessType = "manual_fulfillment" | "registration" | "existing_account";
type PublishedFilter = "all" | "published" | "draft";

type MarketplaceAsset = {
  id: string;
  title: string;
  description: string;
  type: AssetType;
  deliveryType: DeliveryType;
  pricingType: PricingType;
  slug: string;
  category: string;
  tags: string[];
  thumbnailUrl: string;
  assetUrl: string;
  tier: AssetTier;
  currency: string;
  price: number;
  licenseType: LicenseType;
  resaleEnabled: boolean;
  resalePrice: number;
  mrrPrice: number | null;
  mrrLicenseVersion: string | null;
  resellerCommissionType: CommissionType;
  resellerCommissionValue: number;
  commissionBase: CommissionBase;
  courseValue: number;
  externalPlatform: string;
  externalAccessType: ExternalAccessType;
  externalAccessUrl: string;
  accessInstructions: string;
  websiteOnboardingInstructions: string;
  published: boolean;
  createdAt: any;
  updatedAt: any;
};

type AssetFormState = {
  title: string;
  description: string;
  type: AssetType;
  deliveryType: DeliveryType;
  pricingType: PricingType;
  slug: string;
  category: string;
  tags: string;
  thumbnailUrl: string;
  assetUrl: string;
  tier: AssetTier;
  currency: string;
  price: string;
  licenseType: LicenseType;
  resaleEnabled: boolean;
  resalePrice: string;
  mrrPrice: string;
  mrrLicenseVersion: string;
  resellerCommissionType: CommissionType;
  resellerCommissionValue: string;
  commissionBase: CommissionBase;
  courseValue: string;
  externalPlatform: string;
  externalAccessType: ExternalAccessType;
  externalAccessUrl: string;
  accessInstructions: string;
  websiteOnboardingInstructions: string;
  published: boolean;
};

const ASSET_TYPES: AssetType[] = ["pdf", "video", "template", "notion", "link", "code", "external_course"];
const ASSET_TIERS: AssetTier[] = ["free", "pro", "elite"];
const LICENSE_TYPES: LicenseType[] = ["standard", "mrr"];
const COMMISSION_TYPES: CommissionType[] = ["percentage", "fixed"];
const COMMISSION_BASES: CommissionBase[] = ["full_price", "course_price"];
const DELIVERY_TYPES: DeliveryType[] = ["download", "external_access", "hybrid"];
const PRICING_TYPES: PricingType[] = ["free", "paid", "included_with_plan", "promo_only"];
const EXTERNAL_ACCESS_TYPES: ExternalAccessType[] = ["manual_fulfillment", "registration", "existing_account"];

async function adminMarketplaceFetch(path: string, options: RequestInit = {}) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Admin session expired.");
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Marketplace action failed.");
  return payload;
}
const COLLECTION = "marketplaceAssets";

const emptyForm: AssetFormState = {
  title: "",
  description: "",
  type: "pdf",
  deliveryType: "download",
  pricingType: "free",
  slug: "",
  category: "",
  tags: "",
  thumbnailUrl: "",
  assetUrl: "",
  tier: "free",
  currency: "USD",
  price: "0",
  licenseType: "standard",
  resaleEnabled: false,
  resalePrice: "0",
  mrrPrice: "0",
  mrrLicenseVersion: "sdc-mrr-v1",
  resellerCommissionType: "percentage",
  resellerCommissionValue: "0",
  commissionBase: "full_price",
  courseValue: "0",
  externalPlatform: "",
  externalAccessType: "manual_fulfillment",
  externalAccessUrl: "",
  accessInstructions: "",
  websiteOnboardingInstructions: "",
  published: false,
};

function normalizeAsset(id: string, data: Record<string, any>): MarketplaceAsset {
  return {
    id,
    title: data.title || "Untitled asset",
    description: data.description || "",
    type: ASSET_TYPES.includes(data.type) ? data.type : "template",
    deliveryType: DELIVERY_TYPES.includes(data.deliveryType) ? data.deliveryType : data.type === "external_course" ? "external_access" : "download",
    pricingType: PRICING_TYPES.includes(data.pricingType) ? data.pricingType : data.price > 0 ? "paid" : "free",
    slug: typeof data.slug === "string" ? data.slug : "",
    category: data.category || "General",
    tags: Array.isArray(data.tags) ? data.tags : [],
    thumbnailUrl: data.thumbnailUrl || "",
    assetUrl: data.assetUrl || "",
    tier: data.tier === "enterprise" ? "elite" : ASSET_TIERS.includes(data.tier) ? data.tier : "free",
    currency: typeof data.currency === "string" ? data.currency : "USD",
    price: typeof data.price === "number" ? data.price : 0,
    licenseType: data.licenseType === "mrr" ? "mrr" : "standard",
    resaleEnabled: data.resaleEnabled === true,
    resalePrice: typeof data.resalePrice === "number" ? data.resalePrice : typeof data.price === "number" ? data.price : 0,
    mrrPrice: typeof data.mrrPrice === "number" ? data.mrrPrice : null,
    mrrLicenseVersion: typeof data.mrrLicenseVersion === "string" ? data.mrrLicenseVersion : null,
    resellerCommissionType: data.resellerCommissionType === "fixed" ? "fixed" : "percentage",
    resellerCommissionValue: typeof data.resellerCommissionValue === "number" ? data.resellerCommissionValue : 0,
    commissionBase: data.commissionBase === "course_price" ? "course_price" : "full_price",
    courseValue: typeof data.courseValue === "number" ? data.courseValue : typeof data.price === "number" ? data.price : 0,
    externalPlatform: typeof data.externalPlatform === "string" ? data.externalPlatform : "",
    externalAccessType: EXTERNAL_ACCESS_TYPES.includes(data.externalAccessType) ? data.externalAccessType : "manual_fulfillment",
    externalAccessUrl: typeof data.externalAccessUrl === "string" ? data.externalAccessUrl : "",
    accessInstructions: typeof data.accessInstructions === "string" ? data.accessInstructions : "",
    websiteOnboardingInstructions: typeof data.websiteOnboardingInstructions === "string" ? data.websiteOnboardingInstructions : "",
    published: data.published === true,
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
  };
}

function formFromAsset(asset: MarketplaceAsset): AssetFormState {
  return {
    title: asset.title,
    description: asset.description,
    type: asset.type,
    deliveryType: asset.deliveryType,
    pricingType: asset.pricingType,
    slug: asset.slug,
    category: asset.category,
    tags: asset.tags.join(", "),
    thumbnailUrl: asset.thumbnailUrl,
    assetUrl: asset.assetUrl,
    tier: asset.tier,
    currency: asset.currency,
    price: String(asset.price || 0),
    licenseType: asset.licenseType,
    resaleEnabled: asset.resaleEnabled,
    resalePrice: String(asset.resalePrice || asset.price || 0),
    mrrPrice: String(asset.mrrPrice || 0),
    mrrLicenseVersion: asset.mrrLicenseVersion || "sdc-mrr-v1",
    resellerCommissionType: asset.resellerCommissionType,
    resellerCommissionValue: String(asset.resellerCommissionValue || 0),
    commissionBase: asset.commissionBase,
    courseValue: String(asset.courseValue || asset.price || 0),
    externalPlatform: asset.externalPlatform,
    externalAccessType: asset.externalAccessType,
    externalAccessUrl: asset.externalAccessUrl,
    accessInstructions: asset.accessInstructions,
    websiteOnboardingInstructions: asset.websiteOnboardingInstructions,
    published: asset.published,
  };
}

function toDateLabel(value: any) {
  if (!value) return "—";
  const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function parseTags(tags: string) {
  return tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function createProductSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function formatPrice(price: number, tier: AssetTier) {
  if (price === 0) return tier === "free" ? "Free" : "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(price);
}

export default function AdminMarketplacePage() {
  const [assets, setAssets] = useState<MarketplaceAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | AssetType>("all");
  const [tierFilter, setTierFilter] = useState<"all" | AssetTier>("all");
  const [publishedFilter, setPublishedFilter] = useState<PublishedFilter>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<MarketplaceAsset | null>(null);
  const [draftAssetId, setDraftAssetId] = useState<string | null>(null);
  const [form, setForm] = useState<AssetFormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!db) {
      setError("Database not initialized.");
      setLoading(false);
      return;
    }

    const assetsQuery = query(collection(db, COLLECTION), orderBy("createdAt", "desc"));

    return onSnapshot(
      assetsQuery,
      (snapshot) => {
        setAssets(snapshot.docs.map((assetDoc) => normalizeAsset(assetDoc.id, assetDoc.data())));
        setLoading(false);
        setError(null);
      },
      () => {
        setError("Unable to load marketplace assets.");
        setLoading(false);
      }
    );
  }, []);

  const filteredAssets = useMemo(() => {
    const term = search.trim().toLowerCase();

    return assets.filter((asset) => {
      const matchesSearch =
        !term ||
        asset.title.toLowerCase().includes(term) ||
        asset.category.toLowerCase().includes(term) ||
        asset.tags.some((tag) => tag.toLowerCase().includes(term));
      const matchesType = typeFilter === "all" || asset.type === typeFilter;
      const matchesTier = tierFilter === "all" || asset.tier === tierFilter;
      const matchesPublished =
        publishedFilter === "all" ||
        (publishedFilter === "published" && asset.published) ||
        (publishedFilter === "draft" && !asset.published);

      return matchesSearch && matchesType && matchesTier && matchesPublished;
    });
  }, [assets, publishedFilter, search, tierFilter, typeFilter]);

  const openAddModal = () => {
    if (!db) {
      setError("Database not initialized.");
      return;
    }
    setEditingAsset(null);
    setDraftAssetId(crypto.randomUUID());
    setForm(emptyForm);
    setError(null);
    setModalOpen(true);
  };

  const openEditModal = (asset: MarketplaceAsset) => {
    setEditingAsset(asset);
    setDraftAssetId(asset.id);
    setForm(formFromAsset(asset));
    setError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!db) {
      setError("Database not initialized.");
      return;
    }
    setSaving(true);
    setError(null);

    try {
      if (!form.title.trim()) throw new Error("Title is required.");
      if (!form.description.trim()) throw new Error("Description is required.");
      if (!form.category.trim()) throw new Error("Category is required.");
      const slug = createProductSlug(form.slug || form.title);
      if (!slug) throw new Error("A product URL slug is required.");
      const requiresExternalAccess = form.deliveryType === "external_access" || form.type === "external_course";
      const requiresDownload = form.deliveryType === "download" || form.deliveryType === "hybrid";
      if (requiresDownload && !form.assetUrl.trim()) throw new Error("Add a product file or external resource URL.");
      if (requiresExternalAccess && !form.externalPlatform.trim()) throw new Error("External platform is required for external access products.");
      if (requiresExternalAccess && !/^https:\/\//i.test(form.externalAccessUrl.trim())) throw new Error("External access URL must use HTTPS.");
      if (form.type === "external_course" && form.externalAccessType !== "manual_fulfillment") {
        throw new Error("External programs must use manual fulfillment so access is released only after setup is complete.");
      }

      const price = Number(form.price);
      if (Number.isNaN(price) || price < 0) throw new Error("Price must be 0 or higher.");
      const resalePrice = Number(form.resalePrice || form.price);
      if (Number.isNaN(resalePrice) || resalePrice < 0) throw new Error("Resale price must be 0 or higher.");
      const commissionValue = Number(form.resellerCommissionValue);
      if (Number.isNaN(commissionValue) || commissionValue < 0) {
        throw new Error("Reseller commission must be 0 or higher.");
      }
      if (form.resellerCommissionType === "percentage" && commissionValue > 100) {
        throw new Error("Percentage commission cannot be more than 100.");
      }
      if (form.licenseType === "mrr" && form.resaleEnabled && price <= 0) {
        throw new Error("MRR assets need a purchase price.");
      }
      const courseValue = Number(form.courseValue || form.price);
      if (Number.isNaN(courseValue) || courseValue < 0) throw new Error("Product value must be 0 or higher.");
      if (form.commissionBase === "course_price" && courseValue <= 0) {
        throw new Error("Product value is required when commission uses a value override.");
      }
      const mrrPrice = Number(form.mrrPrice || 0);
      if (form.licenseType === "mrr" && (Number.isNaN(mrrPrice) || mrrPrice < 0)) throw new Error("MRR license price must be 0 or higher.");

      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        type: form.type,
        slug,
        deliveryType: form.type === "external_course" ? "external_access" : form.deliveryType,
        pricingType: form.pricingType,
        category: form.category.trim(),
        tags: parseTags(form.tags),
        thumbnailUrl: form.thumbnailUrl.trim(),
        assetUrl: form.assetUrl.trim(),
        tier: form.tier,
        currency: form.currency,
        price,
        licenseType: form.licenseType,
        resaleEnabled: form.licenseType === "mrr" && form.resaleEnabled,
        resalePrice,
        mrrPrice: form.licenseType === "mrr" ? mrrPrice : null,
        mrrLicenseVersion: form.licenseType === "mrr" ? form.mrrLicenseVersion.trim() || "sdc-mrr-v1" : null,
        resellerCommissionType: form.resellerCommissionType,
        resellerCommissionValue: commissionValue,
        commissionBase: form.commissionBase,
        courseValue,
        externalPlatform: form.externalPlatform.trim(),
        externalAccessType: requiresExternalAccess ? form.externalAccessType : null,
        externalAccessUrl: form.externalAccessUrl.trim(),
        accessInstructions: form.accessInstructions.trim(),
        websiteOnboardingInstructions: form.websiteOnboardingInstructions.trim(),
        published: form.published,
        draft: false,
      };

      await adminMarketplaceFetch("/api/admin/marketplace", {
        method: "POST",
        body: JSON.stringify({
          assetId: editingAsset?.id || draftAssetId || undefined,
          asset: payload,
        }),
      });

      setModalOpen(false);
      setEditingAsset(null);
      setDraftAssetId(null);
      setForm(emptyForm);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save asset.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (asset: MarketplaceAsset) => {
    if (!db) {
      setError("Database not initialized.");
      return;
    }
    const confirmed = window.confirm(`Delete "${asset.title}"? This cannot be undone.`);
    if (!confirmed) return;

    try {
      await adminMarketplaceFetch(`/api/admin/marketplace/${asset.id}`, { method: "DELETE" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete asset.");
    }
  };

  const handlePublishedToggle = async (asset: MarketplaceAsset) => {
    if (!db) {
      setError("Database not initialized.");
      return;
    }
    try {
      await adminMarketplaceFetch(`/api/admin/marketplace/${asset.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "publish", published: !asset.published }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update published status.");
    }
  };

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Marketplace Assets</h2>
          <p className="mt-1 text-sm text-white/45">
            Manage resources, pricing, access tiers, and public visibility.
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-cyan-400 px-4 text-sm font-semibold text-black hover:bg-cyan-300"
        >
          <Plus className="h-4 w-4" />
          Add Asset
        </button>
      </section>

      <section className="grid gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-3 md:grid-cols-[1fr_150px_150px_170px]">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by title, category, or tag"
            className="h-10 w-full rounded-md border border-white/10 bg-black/20 pl-9 pr-3 text-sm outline-none focus:border-cyan-400/50"
          />
        </label>
        <select
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value as "all" | AssetType)}
          aria-label="Filter by type"
          className="h-10 rounded-md border border-white/10 bg-black/20 px-3 text-sm outline-none focus:border-cyan-400/50"
        >
          <option value="all">All types</option>
          {ASSET_TYPES.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
        <select
          value={tierFilter}
          onChange={(event) => setTierFilter(event.target.value as "all" | AssetTier)}
          aria-label="Filter by tier"
          className="h-10 rounded-md border border-white/10 bg-black/20 px-3 text-sm outline-none focus:border-cyan-400/50"
        >
          <option value="all">All tiers</option>
          {ASSET_TIERS.map((tier) => (
            <option key={tier} value={tier}>{tier}</option>
          ))}
        </select>
        <select
          value={publishedFilter}
          onChange={(event) => setPublishedFilter(event.target.value as PublishedFilter)}
          aria-label="Filter by status"
          className="h-10 rounded-md border border-white/10 bg-black/20 px-3 text-sm outline-none focus:border-cyan-400/50"
        >
          <option value="all">All statuses</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
        </select>
      </section>

      {error && (
        <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      )}

      <section className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.035]">
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-white/[0.03] text-xs uppercase tracking-wider text-white/45">
              <tr>
                <th className="px-4 py-3 font-medium">Thumbnail</th>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Tier</th>
                <th className="px-4 py-3 font-medium">License</th>
                <th className="px-4 py-3 font-medium">Price</th>
                <th className="px-4 py-3 font-medium">Published</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {loading && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-white/45">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
                      Loading assets
                    </span>
                  </td>
                </tr>
              )}
              {!loading && filteredAssets.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-white/45">
                    No marketplace assets match the current filters.
                  </td>
                </tr>
              )}
              {!loading && filteredAssets.map((asset) => (
                <tr key={asset.id} className="hover:bg-white/[0.025]">
                  <td className="px-4 py-3">
                    <div className="h-[60px] w-[60px] overflow-hidden rounded-md border border-white/10 bg-white/[0.04]">
                      {asset.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={asset.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-white/30">
                          <ImageIcon className="h-5 w-5" />
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-[280px]">
                      <p className="truncate font-medium text-white/90">{asset.title}</p>
                      <p className="truncate text-xs text-white/40">{asset.category}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 uppercase text-white/60">{asset.type}</td>
                  <td className="px-4 py-3 capitalize text-white/70">{asset.tier}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${asset.licenseType === "mrr" ? "bg-cyan-400/15 text-cyan-200" : "bg-white/10 text-white/55"}`}>
                      {asset.licenseType === "mrr" ? "MRR" : "Standard"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-white/70">{formatPrice(asset.price, asset.tier)}</td>
                  <td className="px-4 py-3">
                    <label className="inline-flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={asset.published}
                        onChange={() => handlePublishedToggle(asset)}
                        className="peer sr-only"
                      />
                      <span className="h-5 w-9 rounded-full bg-white/15 after:block after:h-4 after:w-4 after:translate-x-0.5 after:translate-y-0.5 after:rounded-full after:bg-white after:transition peer-checked:bg-cyan-400 peer-checked:after:translate-x-4" />
                      <span className="text-xs text-white/45">{asset.published ? "Live" : "Draft"}</span>
                    </label>
                  </td>
                  <td className="px-4 py-3 text-white/55">{toDateLabel(asset.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(asset)}
                        className="rounded-md border border-white/10 p-2 text-white/60 hover:bg-white/10 hover:text-white"
                        aria-label={`Edit ${asset.title}`}
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(asset)}
                        className="rounded-md border border-red-400/20 p-2 text-red-200/70 hover:bg-red-500/10 hover:text-red-100"
                        aria-label={`Delete ${asset.title}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-lg border border-white/10 bg-[#080a0f] shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#080a0f] px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold">
                  {editingAsset ? "Edit Asset" : "Add Asset"}
                </h3>
                <p className="text-sm text-white/45">
                  Upload files or point to external resource URLs.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-md px-3 py-2 text-sm text-white/60 hover:bg-white/10 hover:text-white"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleSubmit} className="grid gap-5 p-5 md:grid-cols-2">
              <Field label="Title">
                <input
                  required
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  className="admin-input"
                  aria-label="Title"
                />
              </Field>

              <Field label="Category">
                <input
                  required
                  value={form.category}
                  onChange={(event) => setForm({ ...form, category: event.target.value })}
                  className="admin-input"
                  placeholder="Sales, Growth, AI, Operations"
                  aria-label="Category"
                />
              </Field>

              <Field label="Public URL slug">
                <input
                  value={form.slug}
                  onChange={(event) => setForm({ ...form, slug: event.target.value })}
                  className="admin-input"
                  placeholder="launch-pad-2"
                  aria-label="Public URL slug"
                />
                <span className="text-xs leading-5 text-white/40">Used for the public product URL. Leave it blank to generate one from the title.</span>
              </Field>

              <Field label="Description" className="md:col-span-2">
                <textarea
                  required
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  className="admin-input min-h-28 resize-y"
                  aria-label="Description"
                />
              </Field>

              <Field label="Type">
                <select
                  value={form.type}
                  onChange={(event) => {
                    const type = event.target.value as AssetType;
                    setForm({ ...form, type, deliveryType: type === "external_course" ? "external_access" : form.deliveryType });
                  }}
                  className="admin-input"
                  aria-label="Type"
                >
                  {ASSET_TYPES.map((type) => (
                    <option key={type} value={type}>{type === "external_course" ? "External course / program" : type}</option>
                  ))}
                </select>
              </Field>

              <Field label="Delivery method">
                <select
                  value={form.type === "external_course" ? "external_access" : form.deliveryType}
                  onChange={(event) => setForm({ ...form, deliveryType: event.target.value as DeliveryType })}
                  className="admin-input"
                  aria-label="Delivery method"
                  disabled={form.type === "external_course"}
                >
                  {DELIVERY_TYPES.map((deliveryType) => <option key={deliveryType} value={deliveryType}>{deliveryType === "download" ? "Downloadable file" : deliveryType === "external_access" ? "External access" : "Hybrid: file + external access"}</option>)}
                </select>
                <span className="text-xs leading-5 text-white/40">External access keeps the login URL hidden until payment is verified and an admin marks access as sent.</span>
              </Field>

              <Field label="Tier">
                <select
                  value={form.tier}
                  onChange={(event) => setForm({ ...form, tier: event.target.value as AssetTier })}
                  className="admin-input"
                  aria-label="Tier"
                >
                  {ASSET_TIERS.map((tier) => (
                    <option key={tier} value={tier}>{tier}</option>
                  ))}
                </select>
              </Field>

              <Field label="Tags">
                <input
                  value={form.tags}
                  onChange={(event) => setForm({ ...form, tags: event.target.value })}
                  className="admin-input"
                  placeholder="funnels, ai, checklist"
                  aria-label="Tags"
                />
              </Field>

              <Field label="Price">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.price}
                  onChange={(event) => setForm({ ...form, price: event.target.value })}
                  className="admin-input"
                  aria-label="Price"
                />
              </Field>

              <Field label="Pricing mode">
                <select value={form.pricingType} onChange={(event) => setForm({ ...form, pricingType: event.target.value as PricingType })} className="admin-input" aria-label="Pricing mode">
                  {PRICING_TYPES.map((pricingType) => <option key={pricingType} value={pricingType}>{pricingType === "included_with_plan" ? "Included with plan" : pricingType === "promo_only" ? "Promo only" : pricingType[0].toUpperCase() + pricingType.slice(1)}</option>)}
                </select>
              </Field>

              <Field label="Currency">
                <select value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })} className="admin-input" aria-label="Currency">
                  <option value="USD">USD ($) · current checkout currency</option>
                </select>
              </Field>

              <Field label="License">
                <select
                  value={form.licenseType}
                  onChange={(event) => {
                    const licenseType = event.target.value as LicenseType;
                    setForm({
                      ...form,
                      licenseType,
                      resaleEnabled: licenseType === "mrr" ? form.resaleEnabled : false,
                    });
                  }}
                  className="admin-input"
                  aria-label="License"
                >
                  {LICENSE_TYPES.map((licenseType) => (
                    <option key={licenseType} value={licenseType}>
                      {licenseType === "mrr" ? "Master Resell Rights" : "Standard"}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Resale Price">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.resalePrice}
                  onChange={(event) => setForm({ ...form, resalePrice: event.target.value })}
                  className="admin-input"
                  aria-label="Resale Price"
                  disabled={form.licenseType !== "mrr"}
                />
              </Field>

              <Field label="MRR License Price">
                <input type="number" min="0" step="1" value={form.mrrPrice} onChange={(event) => setForm({ ...form, mrrPrice: event.target.value })} className="admin-input" aria-label="MRR License Price" disabled={form.licenseType !== "mrr"} />
                <span className="text-xs leading-5 text-white/40">The price to unlock resale rights, separate from the standard product price.</span>
              </Field>

              <Field label="MRR License Version">
                <input value={form.mrrLicenseVersion} onChange={(event) => setForm({ ...form, mrrLicenseVersion: event.target.value })} className="admin-input" aria-label="MRR License Version" disabled={form.licenseType !== "mrr"} placeholder="sdc-mrr-v1" />
              </Field>

              <Field label="Commission Type">
                <select
                  value={form.resellerCommissionType}
                  onChange={(event) => setForm({ ...form, resellerCommissionType: event.target.value as CommissionType })}
                  className="admin-input"
                  aria-label="Commission Type"
                  disabled={form.licenseType !== "mrr"}
                >
                  {COMMISSION_TYPES.map((commissionType) => (
                    <option key={commissionType} value={commissionType}>
                      {commissionType === "percentage" ? "Percentage" : "Fixed Amount"}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label={form.resellerCommissionType === "percentage" ? "Commission %" : "Commission Amount"}>
                <input
                  type="number"
                  min="0"
                  max={form.resellerCommissionType === "percentage" ? "100" : undefined}
                  step="1"
                  value={form.resellerCommissionValue}
                  onChange={(event) => setForm({ ...form, resellerCommissionValue: event.target.value })}
                  className="admin-input"
                  aria-label="Reseller Commission"
                  disabled={form.licenseType !== "mrr"}
                />
              </Field>

              <Field label="Commission Base">
                <select
                  value={form.commissionBase}
                  onChange={(event) => setForm({ ...form, commissionBase: event.target.value as CommissionBase })}
                  className="admin-input"
                  aria-label="Commission Base"
                  disabled={form.licenseType !== "mrr"}
                >
                  {COMMISSION_BASES.map((commissionBase) => (
                    <option key={commissionBase} value={commissionBase}>
                      {commissionBase === "course_price" ? "Product value only" : "Full bundle price"}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Product Value">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.courseValue}
                  onChange={(event) => setForm({ ...form, courseValue: event.target.value })}
                  className="admin-input"
                  aria-label="Product Value"
                  disabled={form.licenseType !== "mrr"}
                />
              </Field>

              <label className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3 md:col-span-2">
                <input
                  type="checkbox"
                  checked={form.licenseType === "mrr" && form.resaleEnabled}
                  onChange={(event) => setForm({ ...form, resaleEnabled: event.target.checked })}
                  disabled={form.licenseType !== "mrr"}
                  className="h-4 w-4 accent-cyan-400 disabled:opacity-40"
                />
                <span>
                  <span className="block text-sm font-medium">Enable reseller links</span>
                  <span className="text-xs text-white/45">Buyers with an MRR license can resell this product through SDC. Academy courses are managed separately in Academy.</span>
                </span>
              </label>

              <Field label="External platform" className={form.deliveryType === "download" && form.type !== "external_course" ? "hidden" : ""}>
                <input
                  value={form.externalPlatform}
                  onChange={(event) => setForm({ ...form, externalPlatform: event.target.value })}
                  className="admin-input"
                  placeholder="Kajabi"
                  aria-label="External Platform"
                />
              </Field>

              <Field label="External access type" className={form.deliveryType === "download" && form.type !== "external_course" ? "hidden" : ""}>
                <select
                  value={form.externalAccessType}
                  onChange={(event) => setForm({ ...form, externalAccessType: event.target.value as ExternalAccessType })}
                  className="admin-input"
                  aria-label="External access type"
                >
                  {EXTERNAL_ACCESS_TYPES.map((accessType) => (
                    <option key={accessType} value={accessType}>
                      {accessType === "manual_fulfillment" ? "Manual setup · send login details" : accessType === "registration" ? "Registration after fulfillment" : "Existing external account"}
                    </option>
                  ))}
                </select>
                <span className="text-xs leading-5 text-white/40">All external links stay hidden until payment is confirmed and access is fulfilled.</span>
              </Field>

              <Field label="External Access URL" className={form.deliveryType === "download" && form.type !== "external_course" ? "hidden" : ""}>
                <input
                  value={form.externalAccessUrl}
                  onChange={(event) => setForm({ ...form, externalAccessUrl: event.target.value })}
                  className="admin-input"
                  placeholder="https://..."
                  aria-label="External Access URL"
                />
                <span className="text-xs leading-5 text-white/40">Stored privately. Buyers receive it only after verified payment and manual access fulfillment.</span>
              </Field>

              <Field label="Product Access Instructions" className={`md:col-span-2 ${form.deliveryType === "download" && form.type !== "external_course" ? "hidden" : ""}`}>
                <textarea
                  value={form.accessInstructions}
                  onChange={(event) => setForm({ ...form, accessInstructions: event.target.value })}
                  className="admin-input min-h-24 resize-y"
                  placeholder="Shown after payment and after login details have been sent. Do not store passwords here."
                  aria-label="Product Access Instructions"
                />
              </Field>

              <Field label="Website Onboarding Instructions" className="md:col-span-2">
                <textarea
                  value={form.websiteOnboardingInstructions}
                  onChange={(event) => setForm({ ...form, websiteOnboardingInstructions: event.target.value })}
                  className="admin-input min-h-24 resize-y"
                  placeholder="Use this for the $39 website setup portion of a bundle."
                  aria-label="Website Onboarding Instructions"
                />
              </Field>

              <div className="md:col-span-2">
                <AdminMediaPicker
                  label="Product thumbnail"
                  value={form.thumbnailUrl}
                  kind="image"
                  accept="image/*"
                  usageContext="marketplace"
                  linkedEntityType="marketplaceAsset"
                  linkedEntityId={editingAsset?.id || undefined}
                  helperText="Upload a clean product preview, choose from media library, or paste a thumbnail URL."
                  aspectHint="Recommended: 1:1 or 4:5."
                  onChange={(url) => setForm({ ...form, thumbnailUrl: url })}
                />
              </div>

              <div className="md:col-span-2">
                <AdminMediaPicker
                  label="Product file or external resource"
                  value={form.assetUrl}
                  kind="all"
                  usageContext="marketplace"
                  linkedEntityType="marketplaceAsset"
                  linkedEntityId={editingAsset?.id || undefined}
                  helperText={form.deliveryType === "external_access" || form.type === "external_course" ? "Optional supporting file. The external login URL is configured above and released only after fulfillment." : form.deliveryType === "hybrid" ? "Upload the product file and configure the external access details above." : "Upload the product file or paste the external delivery URL."}
                  onChange={(url) => setForm({ ...form, assetUrl: url })}
                />
              </div>

              <label className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3 md:col-span-2">
                <input
                  type="checkbox"
                  checked={form.published}
                  onChange={(event) => setForm({ ...form, published: event.target.checked })}
                  className="h-4 w-4 accent-cyan-400"
                />
                <span>
                  <span className="block text-sm font-medium">Published</span>
                  <span className="text-xs text-white/45">Published assets appear in the public marketplace.</span>
                </span>
              </label>

              <div className="flex justify-end gap-3 border-t border-white/10 pt-5 md:col-span-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="h-10 rounded-md border border-white/10 px-4 text-sm text-white/70 hover:bg-white/10 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-cyan-400 px-4 text-sm font-semibold text-black hover:bg-cyan-300 disabled:opacity-50"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editingAsset ? "Save Changes" : "Create Asset"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx global>{`
        .admin-input {
          height: 2.5rem;
          width: 100%;
          border-radius: 0.375rem;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(0, 0, 0, 0.2);
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          color: white;
          outline: none;
        }
        .admin-input:focus {
          border-color: rgba(34, 211, 238, 0.55);
        }
        textarea.admin-input {
          height: auto;
        }
        .admin-input::placeholder {
          color: rgba(255, 255, 255, 0.3);
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`grid gap-2 ${className}`}>
      <span className="text-xs font-medium uppercase tracking-wider text-white/45">
        {label}
      </span>
      {children}
    </label>
  );
}
