"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import {
  getDownloadURL,
  ref,
  uploadBytesResumable,
} from "firebase/storage";
import {
  Edit,
  FileUp,
  ImageIcon,
  Loader2,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { auth, db, storage } from "@/lib/firebase";

type AssetType = "pdf" | "video" | "template" | "notion" | "link" | "code";
type AssetTier = "free" | "pro" | "elite";
type PublishedFilter = "all" | "published" | "draft";

type MarketplaceAsset = {
  id: string;
  title: string;
  description: string;
  type: AssetType;
  category: string;
  tags: string[];
  thumbnailUrl: string;
  assetUrl: string;
  tier: AssetTier;
  price: number;
  published: boolean;
  createdAt: any;
  updatedAt: any;
};

type AssetFormState = {
  title: string;
  description: string;
  type: AssetType;
  category: string;
  tags: string;
  thumbnailUrl: string;
  assetUrl: string;
  tier: AssetTier;
  price: string;
  published: boolean;
};

const ASSET_TYPES: AssetType[] = ["pdf", "video", "template", "notion", "link", "code"];
const ASSET_TIERS: AssetTier[] = ["free", "pro", "elite"];
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const COLLECTION = "marketplaceAssets";

const emptyForm: AssetFormState = {
  title: "",
  description: "",
  type: "pdf",
  category: "",
  tags: "",
  thumbnailUrl: "",
  assetUrl: "",
  tier: "free",
  price: "0",
  published: false,
};

function normalizeAsset(id: string, data: Record<string, any>): MarketplaceAsset {
  return {
    id,
    title: data.title || "Untitled asset",
    description: data.description || "",
    type: ASSET_TYPES.includes(data.type) ? data.type : "template",
    category: data.category || "General",
    tags: Array.isArray(data.tags) ? data.tags : [],
    thumbnailUrl: data.thumbnailUrl || "",
    assetUrl: data.assetUrl || "",
    tier: data.tier === "enterprise" ? "elite" : ASSET_TIERS.includes(data.tier) ? data.tier : "free",
    price: typeof data.price === "number" ? data.price : 0,
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
    category: asset.category,
    tags: asset.tags.join(", "),
    thumbnailUrl: asset.thumbnailUrl,
    assetUrl: asset.assetUrl,
    tier: asset.tier,
    price: String(asset.price || 0),
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

function formatPrice(price: number, tier: AssetTier) {
  if (price === 0) return tier === "free" ? "Free" : "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(price);
}

function validateUpload(file: File, purpose: "thumbnail" | "asset") {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("File must be smaller than 50MB.");
  }

  if (purpose === "thumbnail" && !file.type.startsWith("image/")) {
    throw new Error("Thumbnail upload must be an image file.");
  }

  if (purpose === "asset" && !file.type) {
    throw new Error("File type could not be detected.");
  }
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
  const [thumbnailProgress, setThumbnailProgress] = useState<number | null>(null);
  const [assetProgress, setAssetProgress] = useState<number | null>(null);

  useEffect(() => {
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
    setEditingAsset(null);
    setDraftAssetId(doc(collection(db, COLLECTION)).id);
    setForm(emptyForm);
    setError(null);
    setThumbnailProgress(null);
    setAssetProgress(null);
    setModalOpen(true);
  };

  const openEditModal = (asset: MarketplaceAsset) => {
    setEditingAsset(asset);
    setDraftAssetId(asset.id);
    setForm(formFromAsset(asset));
    setError(null);
    setThumbnailProgress(null);
    setAssetProgress(null);
      setModalOpen(true);
  };

  const uploadFile = async (
    file: File,
    assetId: string,
    purpose: "thumbnail" | "asset"
  ) => {
    validateUpload(file, purpose);
    const uid = auth.currentUser?.uid;

    if (!uid) {
      throw new Error("Admin session expired. Please sign in again.");
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const storageRef = ref(storage, `marketplace-assets/${assetId}/${safeName}`);
    const uploadTask = uploadBytesResumable(storageRef, file, {
      customMetadata: {
        assetId,
        uploadedBy: uid,
        type: purpose === "thumbnail" ? "thumbnail" : "asset",
      },
    });

    return new Promise<string>((resolve, reject) => {
      uploadTask.on(
        "state_changed",
        (snapshot) => {
          const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          if (purpose === "thumbnail") setThumbnailProgress(progress);
          if (purpose === "asset") setAssetProgress(progress);
        },
        reject,
        async () => {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(url);
        }
      );
    });
  };

  const ensureUploadAssetId = async () => {
    if (editingAsset) return editingAsset.id;

    const assetId = draftAssetId || doc(collection(db, COLLECTION)).id;
    if (!draftAssetId) setDraftAssetId(assetId);

    await setDoc(
      doc(db, COLLECTION, assetId),
      {
        title: form.title.trim() || "Untitled draft",
        description: form.description.trim() || "",
        type: form.type,
        category: form.category.trim() || "General",
        tags: parseTags(form.tags),
        thumbnailUrl: form.thumbnailUrl.trim(),
        assetUrl: form.assetUrl.trim(),
        tier: form.tier,
        price: Number(form.price) || 0,
        published: false,
        draft: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return assetId;
  };

  const handleUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    purpose: "thumbnail" | "asset"
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);

    try {
      const assetId = await ensureUploadAssetId();
      const url = await uploadFile(file, assetId, purpose);
      setForm((current) => ({
        ...current,
        [purpose === "thumbnail" ? "thumbnailUrl" : "assetUrl"]: url,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      event.target.value = "";
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      if (!form.title.trim()) throw new Error("Title is required.");
      if (!form.description.trim()) throw new Error("Description is required.");
      if (!form.category.trim()) throw new Error("Category is required.");
      if (!form.assetUrl.trim()) throw new Error("Add an asset file or external URL.");

      const price = Number(form.price);
      if (Number.isNaN(price) || price < 0) throw new Error("Price must be 0 or higher.");

      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        type: form.type,
        category: form.category.trim(),
        tags: parseTags(form.tags),
        thumbnailUrl: form.thumbnailUrl.trim(),
        assetUrl: form.assetUrl.trim(),
        tier: form.tier,
        price,
        published: form.published,
        draft: false,
        updatedAt: serverTimestamp(),
      };

      if (editingAsset) {
        await updateDoc(doc(db, COLLECTION, editingAsset.id), payload);
      } else {
        const assetId = draftAssetId || doc(collection(db, COLLECTION)).id;
        await setDoc(doc(db, COLLECTION, assetId), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }

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
    const confirmed = window.confirm(`Delete "${asset.title}"? This cannot be undone.`);
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, COLLECTION, asset.id));
    } catch {
      setError("Unable to delete asset.");
    }
  };

  const handlePublishedToggle = async (asset: MarketplaceAsset) => {
    try {
      await updateDoc(doc(db, COLLECTION, asset.id), {
        published: !asset.published,
        updatedAt: serverTimestamp(),
      });
    } catch {
      setError("Unable to update published status.");
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
                <th className="px-4 py-3 font-medium">Price</th>
                <th className="px-4 py-3 font-medium">Published</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {loading && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-white/45">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
                      Loading assets
                    </span>
                  </td>
                </tr>
              )}
              {!loading && filteredAssets.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-white/45">
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
                />
              </Field>

              <Field label="Category">
                <input
                  required
                  value={form.category}
                  onChange={(event) => setForm({ ...form, category: event.target.value })}
                  className="admin-input"
                  placeholder="Sales, Growth, AI, Operations"
                />
              </Field>

              <Field label="Description" className="md:col-span-2">
                <textarea
                  required
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  className="admin-input min-h-28 resize-y"
                />
              </Field>

              <Field label="Type">
                <select
                  value={form.type}
                  onChange={(event) => setForm({ ...form, type: event.target.value as AssetType })}
                  className="admin-input"
                >
                  {ASSET_TYPES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </Field>

              <Field label="Tier">
                <select
                  value={form.tier}
                  onChange={(event) => setForm({ ...form, tier: event.target.value as AssetTier })}
                  className="admin-input"
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
                />
              </Field>

              <Field label="Thumbnail URL or upload" className="md:col-span-2">
                <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                  <input
                    value={form.thumbnailUrl}
                    onChange={(event) => setForm({ ...form, thumbnailUrl: event.target.value })}
                    className="admin-input"
                    placeholder="https://..."
                  />
                  <UploadButton icon={ImageIcon} label="Upload Image" accept="image/*" onChange={(event) => handleUpload(event, "thumbnail")} />
                </div>
                {thumbnailProgress !== null && (
                  <ProgressBar label="Thumbnail upload" value={thumbnailProgress} />
                )}
              </Field>

              <Field label="Asset file upload or external URL" className="md:col-span-2">
                <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                  <input
                    value={form.assetUrl}
                    onChange={(event) => setForm({ ...form, assetUrl: event.target.value })}
                    className="admin-input"
                    placeholder="https://..."
                  />
                  <UploadButton icon={FileUp} label="Upload File" onChange={(event) => handleUpload(event, "asset")} />
                </div>
                {assetProgress !== null && (
                  <ProgressBar label="Asset upload" value={assetProgress} />
                )}
              </Field>

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

function UploadButton({
  icon: Icon,
  label,
  accept,
  onChange,
}: {
  icon: typeof FileUp;
  label: string;
  accept?: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-white/10 px-3 text-sm text-white/70 hover:bg-white/10 hover:text-white">
      <Icon className="h-4 w-4" />
      {label}
      <input type="file" accept={accept} onChange={onChange} className="sr-only" />
    </label>
  );
}

function ProgressBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="mt-2">
      <div className="mb-1 flex justify-between text-xs text-white/45">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-cyan-400 transition-all"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}
