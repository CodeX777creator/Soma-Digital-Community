"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Facebook,
  Instagram,
  Link2,
  Linkedin,
  Loader2,
  LockKeyhole,
  Megaphone,
  MessageSquareText,
  MoreHorizontal,
  Plus,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  TrendingUp,
  Wand2,
  X,
  Youtube,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/providers/AuthProvider";
import { parseApiError } from "@/lib/clientApi";
import { showErrorToast } from "@/lib/error-toast";
import { cn } from "@/lib/utils";
import { SOCIAL_PROVIDER_REGISTRY } from "@/lib/social-data";
import type { SocialAccountRecord, SocialPlatform } from "@/social/types";

type SocialHubResponse = {
  providers: typeof SOCIAL_PROVIDER_REGISTRY;
  summary: {
    totalAccounts: number;
    connectedAccounts: number;
    pendingAccounts: number;
    expiredAccounts: number;
    disconnectedAccounts: number;
    byProvider: Record<SocialPlatform, number>;
  };
  accounts: SocialAccountRecord[];
};

type OAuthStartResponse = {
  provider: SocialPlatform;
  socialAccountId: string;
  callbackUrl: string;
  authorizationUrl: string | null;
  state: string;
  stateHash: string;
  flowMode: string;
  requiresPkce: boolean;
  supportsRefreshToken: boolean;
  nextStep: string;
};

const DEFAULT_PROVIDER: SocialPlatform = "instagram";

const PLATFORM_STYLES: Record<SocialPlatform, { gradient: string }> = {
  tiktok: {
    gradient: "from-cyan-400 via-white to-rose-500",
  },
  instagram: {
    gradient: "from-fuchsia-500 via-rose-500 to-amber-400",
  },
  facebook: {
    gradient: "from-blue-500 via-sky-400 to-blue-700",
  },
  linkedin: {
    gradient: "from-sky-500 via-blue-500 to-cyan-300",
  },
  x: {
    gradient: "from-zinc-100 via-zinc-500 to-zinc-950",
  },
  youtube: {
    gradient: "from-red-500 via-rose-500 to-red-700",
  },
};

const QUICK_ACTIONS = [
  { label: "Create New Post", description: "Design content with AI", icon: Wand2 },
  { label: "Schedule Post", description: "Plan your content calendar", icon: CalendarDays },
  { label: "Bulk Upload", description: "Prepare multiple posts", icon: Plus },
  { label: "Content Planner", description: "Build a campaign plan", icon: Megaphone },
];

const SOCIAL_TABS = ["Connected Accounts", "Scheduling", "Analytics", "Content Planner", "Automations", "Integrations"];

const PLATFORM_ICON: Record<SocialPlatform, ReactNode> = {
  tiktok: <Smartphone className="h-6 w-6" />,
  instagram: <Instagram className="h-6 w-6" />,
  facebook: <Facebook className="h-6 w-6" />,
  linkedin: <Linkedin className="h-6 w-6" />,
  x: <X className="h-6 w-6" />,
  youtube: <Youtube className="h-6 w-6" />,
};

function formatDate(value?: string | null): string {
  if (!value) return "Not available";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function getReadinessTone(account: SocialAccountRecord): {
  label: string;
  className: string;
  icon: ReactNode;
  helper: string;
} {
  const readiness = account.connectionReadiness;
  if (!readiness) {
    return {
      label: "Connected",
      className: "border-blue-400/20 bg-blue-500/12 text-blue-100",
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      helper: "Readiness check pending.",
    };
  }

  if (readiness.publishReady) {
    return {
      label: readiness.analyticsReady ? "Publish + analytics ready" : "Publish ready",
      className: "border-emerald-400/20 bg-emerald-500/12 text-emerald-200",
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      helper: readiness.summary || "Ready for scheduled publishing.",
    };
  }

  if (readiness.status === "permission_missing" || readiness.status === "needs_reauth") {
    return {
      label: "Needs attention",
      className: "border-amber-400/25 bg-amber-500/12 text-amber-100",
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
      helper: readiness.summary || readiness.warnings[0] || "Reconnect or update provider permissions.",
    };
  }

  return {
    label: "Review readiness",
    className: "border-violet-300/20 bg-violet-500/12 text-violet-100",
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    helper: readiness.summary || readiness.warnings[0] || "Connection is active, but publishing readiness is still being verified.",
  };
}

export default function SocialHubPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [accounts, setAccounts] = useState<SocialAccountRecord[]>([]);
  const [providers, setProviders] = useState<typeof SOCIAL_PROVIDER_REGISTRY>(SOCIAL_PROVIDER_REGISTRY);
  const [summary, setSummary] = useState<SocialHubResponse["summary"]>({
    totalAccounts: 0,
    connectedAccounts: 0,
    pendingAccounts: 0,
    expiredAccounts: 0,
    disconnectedAccounts: 0,
    byProvider: {
      tiktok: 0,
      instagram: 0,
      facebook: 0,
      linkedin: 0,
      x: 0,
      youtube: 0,
    },
  });
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [connectingProvider, setConnectingProvider] = useState<SocialPlatform | null>(null);
  const [destinationActionAccountId, setDestinationActionAccountId] = useState<string | null>(null);
  const [oauthHandshake, setOAuthHandshake] = useState<OAuthStartResponse | null>(null);

  useEffect(() => {
    const oauthStatus = searchParams.get("oauth_status");
    if (!oauthStatus) return;

    const provider = searchParams.get("oauth_provider");
    const error = searchParams.get("oauth_error");
    const providerLabel = provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : "Provider";

    toast({
      title: oauthStatus === "connected" ? `${providerLabel} connected` : `${providerLabel} connection needs attention`,
      description: oauthStatus === "connected"
        ? "Your OAuth handoff completed successfully and the account is now linked."
        : error || "The provider returned an error during the connection flow.",
      variant: oauthStatus === "connected" ? "default" : "destructive",
    });
  }, [searchParams, toast]);
  const loadAccounts = async () => {
    if (!user) return;

    const idToken = await user.getIdToken();
    const response = await fetch("/api/social/accounts?limit=24", {
      headers: { Authorization: `Bearer ${idToken}` },
    });

    if (!response.ok) {
      throw await parseApiError(response, "Could not load social accounts.");
    }

    const data = (await response.json()) as SocialHubResponse;
    setAccounts(data.accounts || []);
    setProviders(data.providers || SOCIAL_PROVIDER_REGISTRY);
    setSummary(data.summary);
  };

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      if (!user) {
        setLoadingHistory(false);
        return;
      }

      try {
        const idToken = await user.getIdToken();
        const response = await fetch("/api/social/accounts?limit=24", {
          headers: { Authorization: `Bearer ${idToken}` },
        });

        if (!response.ok) {
          throw await parseApiError(response, "Could not load social accounts.");
        }

        const data = (await response.json()) as SocialHubResponse;
        if (mounted) {
          setAccounts(data.accounts || []);
          setProviders(data.providers || SOCIAL_PROVIDER_REGISTRY);
          setSummary(data.summary);
        }
      } catch (error) {
        if (mounted) {
          showErrorToast(toast, error, {
            title: "Social hub unavailable",
            fallback: "Could not load connected accounts.",
          });
        }
      } finally {
        if (mounted) {
          setLoadingHistory(false);
        }
      }
    };

    run();
    return () => {
      mounted = false;
    };
  }, [toast, user]);

  const connectedByProvider = useMemo(() => {
    return accounts.reduce<Partial<Record<SocialPlatform, SocialAccountRecord>>>((current, account) => {
      if (account.status === "connected" && !current[account.providerId]) {
        current[account.providerId] = account;
      }
      return current;
    }, {});
  }, [accounts]);

  const pendingByProvider = useMemo(() => {
    return accounts.reduce<Partial<Record<SocialPlatform, SocialAccountRecord>>>((current, account) => {
      if (account.status !== "connected" && !current[account.providerId]) {
        current[account.providerId] = account;
      }
      return current;
    }, {});
  }, [accounts]);

  const startOAuthHandshake = async (providerId: SocialPlatform, existingAccount?: SocialAccountRecord) => {
    if (!user || loading) return;

    try {
      setLoading(true);
      setConnectingProvider(providerId);
      const provider = providers.find((entry) => entry.id === providerId);
      const idToken = await user.getIdToken();
      const response = await fetch(`/api/social/oauth/${providerId}/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          socialAccountId: existingAccount?.socialAccountId,
          accountName: existingAccount?.accountName || `${provider?.label || providerId} account`,
          handle: existingAccount?.handle || undefined,
          providerAccountId: existingAccount?.providerAccountId || undefined,
          returnTo: "/social",
        }),
      });

      if (!response.ok) {
        throw await parseApiError(response, "OAuth handoff could not be prepared.");
      }

      const data = (await response.json()) as OAuthStartResponse;
      setOAuthHandshake(data);
      if (data.authorizationUrl) {
        window.location.assign(data.authorizationUrl);
        return;
      }
      await loadAccounts();
      toast({
        title: "Connection prepared",
        description: data.authorizationUrl
          ? "Redirecting you to the provider."
          : "This provider still needs its authorization URL configured before customers can connect it.",
      });
    } catch (error) {
      showErrorToast(toast, error, {
        title: "Connection failed",
        fallback: "Could not prepare the OAuth connection.",
      });
    } finally {
      setLoading(false);
      setConnectingProvider(null);
    }
  };

  const disconnectAccount = async (accountId: string) => {
    if (!user || loading) return;

    try {
      setLoading(true);
      const idToken = await user.getIdToken();
      const response = await fetch(`/api/social/accounts/${accountId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${idToken}` },
      });

      if (!response.ok) {
        throw await parseApiError(response, "Disconnect failed.");
      }

      await loadAccounts();
      toast({
        title: "Account disconnected",
        description: "Credentials were cleared and the connection was archived.",
      });
    } catch (error) {
      showErrorToast(toast, error, {
        title: "Disconnect failed",
        fallback: "The social connection could not be updated.",
      });
    } finally {
      setLoading(false);
    }
  };

  const deleteAccount = async (accountId: string) => {
    if (!user || loading) return;
    if (!window.confirm("Delete this social account permanently? This cannot be undone.")) return;

    try {
      setLoading(true);
      const idToken = await user.getIdToken();
      const response = await fetch(`/api/social/accounts/${accountId}?permanent=true`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Unable to delete social account.');
      }
      toast({
        title: 'Social account deleted',
        description: 'The account and its stored credentials were removed.',
      });
      await loadAccounts();
    } catch (error) {
      toast({
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Unable to delete social account.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const refreshDestinations = async (accountId: string) => {
    if (!user || loading) return;

    try {
      setDestinationActionAccountId(accountId);
      const idToken = await user.getIdToken();
      const response = await fetch(`/api/social/accounts/${accountId}/destinations`, {
        method: "GET",
        headers: { Authorization: `Bearer ${idToken}` },
      });

      if (!response.ok) {
        throw await parseApiError(response, "Could not refresh destinations.");
      }

      await loadAccounts();
      toast({
        title: "Destinations refreshed",
        description: "Available publishing destinations were synced from the provider.",
      });
    } catch (error) {
      showErrorToast(toast, error, {
        title: "Destination refresh failed",
        fallback: "Could not refresh this account.",
      });
    } finally {
      setDestinationActionAccountId(null);
    }
  };

  const selectDestination = async (accountId: string, destinationId: string) => {
    if (!user || loading || !destinationId) return;

    try {
      setDestinationActionAccountId(accountId);
      const idToken = await user.getIdToken();
      const response = await fetch(`/api/social/accounts/${accountId}/destinations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ destinationId }),
      });

      if (!response.ok) {
        throw await parseApiError(response, "Could not select destination.");
      }

      await loadAccounts();
      toast({
        title: "Destination selected",
        description: "Scheduled posts will use the selected publishing destination.",
      });
    } catch (error) {
      showErrorToast(toast, error, {
        title: "Destination update failed",
        fallback: "Could not update this account.",
      });
    } finally {
      setDestinationActionAccountId(null);
    }
  };

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="space-y-8">
          <section className="overflow-hidden rounded-[28px] border border-white/10 bg-[#0b1020] shadow-2xl shadow-black/30">
            <div className="relative min-h-[220px] p-6 sm:p-8">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_74%_18%,rgba(139,92,246,0.42),transparent_32%),radial-gradient(circle_at_22%_26%,rgba(79,157,255,0.2),transparent_30%)]" />
              <div className="absolute right-8 top-8 hidden h-40 w-[48%] rounded-full border border-violet-300/20 bg-violet-500/10 blur-sm lg:block" />
              <div className="relative z-10 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-2xl">
                  <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-1 text-xs text-violet-100">
                    <Sparkles className="h-3.5 w-3.5" />
                    Social operating center
                  </div>
                  <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">Social Hub</h1>
                  <p className="mt-4 max-w-xl text-base leading-7 text-white/72">
                    Connect, manage, and grow across every platform from one calm workspace. No token forms, no secret fields, just secure OAuth.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3 sm:grid-cols-6 lg:w-[420px]">
                  {providers.map((provider) => (
                    <div
                      key={provider.id}
                      className={cn(
                        "flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br text-slate-950 shadow-lg shadow-black/30",
                        PLATFORM_STYLES[provider.id].gradient
                      )}
                    >
                      {PLATFORM_ICON[provider.id]}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="relative flex gap-2 overflow-x-auto border-t border-white/10 bg-black/15 px-4 py-3 sm:px-6">
              {SOCIAL_TABS.map((tab, index) => (
                <Link
                  key={tab}
                  href={index === 1 ? "/social/calendar" : "/social"}
                  className={cn(
                    "whitespace-nowrap rounded-full px-4 py-2 text-sm text-white/58 transition hover:bg-white/8 hover:text-white",
                    index === 0 && "bg-violet-500/15 text-violet-100 ring-1 ring-violet-400/25"
                  )}
                >
                  {tab}
                </Link>
              ))}
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_336px]">
            <main className="space-y-8">
              <section>
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-white">Connected Accounts</h2>
                    <p className="mt-1 text-sm text-white/58">Manage the accounts already connected to SDC.</p>
                  </div>
                  <Button type="button" variant="outline" onClick={loadAccounts} disabled={loadingHistory || loading}>
                    {loadingHistory ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Refresh
                  </Button>
                </div>

                {loadingHistory ? (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {[0, 1, 2].map((item) => (
                      <div key={item} className="h-56 animate-pulse rounded-3xl border border-white/10 bg-white/[0.04]" />
                    ))}
                  </div>
                ) : accounts.filter((account) => account.status === "connected").length === 0 ? (
                  <GlassCard className="overflow-hidden rounded-[24px] border-white/10 bg-white/[0.04] p-8">
                    <div className="grid gap-8 lg:grid-cols-[1fr_320px] lg:items-center">
                      <div>
                        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-violet-500 shadow-lg shadow-violet-950/40">
                          <Link2 className="h-7 w-7 text-white" />
                        </div>
                        <h3 className="text-2xl font-semibold text-white">Connect your first social account</h3>
                        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/62">
                          Choose a platform below and SDC will send you to the provider to authorize access. Credentials are handled server-side and never shown in the browser.
                        </p>
                      </div>
                      <div className="rounded-3xl border border-violet-300/15 bg-violet-500/10 p-5">
                        <div className="flex items-center gap-3 text-sm font-medium text-white">
                          <ShieldCheck className="h-5 w-5 text-emerald-300" />
                          Secure by default
                        </div>
                        <p className="mt-2 text-sm leading-6 text-white/58">
                          OAuth callbacks store encrypted connection records in Firestore, ready for scheduling and analytics.
                        </p>
                      </div>
                    </div>
                  </GlassCard>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {accounts
                      .filter((account) => account.status === "connected")
                      .map((account) => {
                        const readinessTone = getReadinessTone(account);
                        const destinations = account.providerDestinations || [];
                        const selectedDestination = destinations.find((destination) => destination.destinationId === account.selectedDestinationId) || destinations[0];
                        const destinationBusy = destinationActionAccountId === account.socialAccountId;
                        return (
                        <GlassCard key={account.socialAccountId} className="group overflow-hidden rounded-[24px] border-white/10 bg-white/[0.045] p-5 transition duration-300 hover:-translate-y-1 hover:bg-white/[0.065]">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-4">
                              <div className={cn("flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br text-slate-950 shadow-lg shadow-black/30", PLATFORM_STYLES[account.providerId].gradient)}>
                                {PLATFORM_ICON[account.providerId]}
                              </div>
                              <div>
                                <div className="font-semibold text-white">{account.providerLabel}</div>
                                <div className="text-sm text-white/52">{account.handle || account.accountName}</div>
                              </div>
                            </div>
                            <Button type="button" variant="ghost" size="icon" className="rounded-full text-white/50 hover:text-white" aria-label={`${account.providerLabel} account options`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className={cn("mt-5 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium", readinessTone.className)}>
                            {readinessTone.icon}
                            {readinessTone.label}
                          </div>
                          <p className="mt-3 min-h-[40px] text-sm leading-5 text-white/55">{readinessTone.helper}</p>

                          <div className="mt-5 rounded-2xl border border-white/8 bg-white/[0.035] p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-xs uppercase tracking-[0.16em] text-white/38">Publishing destination</div>
                                <div className="mt-1 text-sm font-medium text-white">
                                  {selectedDestination?.handle || selectedDestination?.label || account.handle || account.accountName}
                                </div>
                                <div className="mt-0.5 text-xs text-white/42">
                                  {selectedDestination ? `${selectedDestination.type} · ${selectedDestination.providerAccountId}` : "Refresh to discover provider destinations"}
                                </div>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="rounded-xl text-white/48 hover:text-white"
                                onClick={() => refreshDestinations(account.socialAccountId)}
                                disabled={destinationBusy}
                                aria-label={`Refresh ${account.providerLabel} destinations`}
                              >
                                {destinationBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                              </Button>
                            </div>

                            {destinations.length > 1 ? (
                              <select
                                aria-label={`Select ${account.providerLabel} publishing destination`}
                                value={account.selectedDestinationId || selectedDestination?.destinationId || ""}
                                onChange={(event) => selectDestination(account.socialAccountId, event.target.value)}
                                disabled={destinationBusy}
                                className="mt-3 h-10 w-full rounded-xl border border-white/10 bg-[#090B13] px-3 text-sm text-white outline-none transition focus:border-violet-300/50"
                              >
                                {destinations.map((destination) => (
                                  <option key={destination.destinationId} value={destination.destinationId}>
                                    {destination.handle || destination.label} · {destination.type}
                                  </option>
                                ))}
                              </select>
                            ) : null}
                          </div>

                          <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <div className="text-white/42">Publishing</div>
                              <div className="mt-1 font-medium text-white">{account.connectionReadiness?.publishReady ? "Ready" : "Review"}</div>
                            </div>
                            <div>
                              <div className="text-white/42">Analytics</div>
                              <div className="mt-1 font-medium text-white">{account.connectionReadiness?.analyticsReady ? "Ready" : "Limited"}</div>
                            </div>
                            <div>
                              <div className="text-white/42">Authorization</div>
                              <div className="mt-1 font-medium text-white">{account.hasCredentials ? "Encrypted" : "Pending sync"}</div>
                            </div>
                            <div>
                              <div className="text-white/42">Updated</div>
                              <div className="mt-1 font-medium text-white">{formatDate(account.connectionReadiness?.checkedAt || account.updatedAt)}</div>
                            </div>
                          </div>

                          <div className="mt-5 flex gap-2">
                            <Button type="button" className="flex-1 rounded-2xl bg-white/8 text-white hover:bg-white/12" variant="ghost">
                              View Analytics
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="rounded-2xl text-white/48 hover:text-red-200"
                              onClick={() => disconnectAccount(account.socialAccountId)}
                              disabled={loading}
                              aria-label={`Disconnect ${account.providerLabel}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="rounded-2xl text-white/48 hover:text-red-300"
                              onClick={() => deleteAccount(account.socialAccountId)}
                              disabled={loading}
                              aria-label={`Delete ${account.providerLabel} permanently`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </GlassCard>
                      );
                      })}
                  </div>
                )}
              </section>

              <section>
                <div className="mb-4 flex items-end justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold text-white">Connect More Platforms</h2>
                    <p className="mt-1 text-sm text-white/58">Authorize a platform in one click. SDC handles the secure handoff.</p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {providers.map((provider) => {
                    const connected = connectedByProvider[provider.id];
                    const pending = pendingByProvider[provider.id];
                    const isConnecting = connectingProvider === provider.id;

                    return (
                      <GlassCard key={provider.id} className="group overflow-hidden rounded-[24px] border-white/10 bg-white/[0.04] p-5 transition duration-300 hover:-translate-y-1 hover:bg-white/[0.06]">
                        <div className="flex items-start gap-4">
                          <div className={cn("flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br text-slate-950 shadow-lg shadow-black/30", PLATFORM_STYLES[provider.id].gradient)}>
                            {PLATFORM_ICON[provider.id]}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-white">{provider.label}</h3>
                              {provider.id === DEFAULT_PROVIDER ? (
                                <span className="rounded-full border border-violet-300/20 bg-violet-500/12 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-violet-100">Recommended</span>
                              ) : null}
                            </div>
                            <p className="mt-2 text-sm leading-6 text-white/58">{provider.description}</p>
                          </div>
                        </div>

                        <Button
                          type="button"
                          className="mt-5 h-11 w-full rounded-2xl bg-gradient-to-r from-blue-500 via-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-950/30 hover:shadow-violet-700/25"
                          onClick={() => startOAuthHandshake(provider.id, pending)}
                          disabled={loading || Boolean(connected)}
                        >
                          {isConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : connected ? <CheckCircle2 className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
                          {connected ? "Connected" : pending ? `Continue ${provider.label}` : provider.connectLabel}
                        </Button>
                      </GlassCard>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-[28px] border border-white/10 bg-white/[0.035] p-6">
                <h2 className="text-xl font-semibold text-white">How It Works</h2>
                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  {[
                    { title: "Connect", description: "Choose a platform and start the secure OAuth flow.", icon: Link2 },
                    { title: "Authorize", description: "Approve the permissions requested by the provider.", icon: LockKeyhole },
                    { title: "Optimize", description: "Use SDC to plan, schedule, and analyze content.", icon: TrendingUp },
                  ].map((step, index) => (
                    <div key={step.title} className="relative rounded-3xl border border-white/10 bg-[#111827]/70 p-5">
                      <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-100">
                          <step.icon className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="text-sm text-white/42">{index + 1}.</div>
                          <div className="font-semibold text-white">{step.title}</div>
                        </div>
                      </div>
                      <p className="mt-4 text-sm leading-6 text-white/58">{step.description}</p>
                      {index < 2 ? <ChevronRight className="absolute -right-5 top-1/2 hidden h-5 w-5 -translate-y-1/2 text-white/18 md:block" /> : null}
                    </div>
                  ))}
                </div>
                <div className="mt-5 flex items-center justify-center gap-2 text-sm text-white/50">
                  <ShieldCheck className="h-4 w-4 text-emerald-300" />
                  We never ask creators to paste access tokens into the app.
                </div>
              </section>
            </main>

            <aside className="space-y-5">
              <GlassCard className="rounded-[24px] border-white/10 bg-white/[0.045] p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-semibold text-white">Social Overview</h2>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/54">This Month</span>
                </div>
                <div className="mt-5 space-y-4">
                  {[
                    ["Connected accounts", summary.connectedAccounts, "Ready"],
                    ["Pending handoffs", summary.pendingAccounts, "Review"],
                    ["Needs attention", summary.expiredAccounts + summary.disconnectedAccounts, "Fix"],
                    ["Supported platforms", providers.length, "Available"],
                  ].map(([label, value, status]) => (
                    <div key={label} className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.035] p-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/14 text-violet-100">
                          <BarChart3 className="h-4 w-4" />
                        </div>
                        <div className="text-sm text-white/62">{label}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-white">{value}</div>
                        <div className="text-xs text-emerald-300">{status}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </GlassCard>

              <GlassCard className="rounded-[24px] border-white/10 bg-white/[0.045] p-5">
                <h2 className="font-semibold text-white">Quick Actions</h2>
                <div className="mt-4 space-y-3">
                  {QUICK_ACTIONS.map((action) => (
                    <Link key={action.label} href={action.label === "Schedule Post" ? "/social/calendar" : "/ai/studio"} className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.035] p-3 transition hover:bg-white/[0.07]">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-500 text-white">
                          <action.icon className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-white">{action.label}</div>
                          <div className="text-xs text-white/48">{action.description}</div>
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-white/35" />
                    </Link>
                  ))}
                </div>
              </GlassCard>

              <GlassCard className="rounded-[24px] border-white/10 bg-gradient-to-br from-violet-500/18 via-blue-500/10 to-transparent p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/20 text-violet-100">
                    <MessageSquareText className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-white">AI Social Assistant</h2>
                    <div className="text-xs uppercase tracking-[0.18em] text-violet-100/72">Beta</div>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-6 text-white/62">
                  Generate platform-specific post ideas and campaign plans after your accounts are connected.
                </p>
                <Button asChild className="mt-5 h-11 w-full rounded-2xl bg-gradient-to-r from-blue-500 to-violet-500 text-white">
                  <Link href="/ai/studio">
                    Get Suggestions
                    <Sparkles className="h-4 w-4" />
                  </Link>
                </Button>
              </GlassCard>

              {oauthHandshake && !oauthHandshake.authorizationUrl ? (
                <GlassCard className="rounded-[24px] border-amber-400/20 bg-amber-500/10 p-5">
                  <div className="font-semibold text-amber-100">Provider setup needed</div>
                  <p className="mt-2 text-sm leading-6 text-amber-100/70">
                    The secure handoff was created, but this provider still needs its authorization settings configured before redirect.
                  </p>
                </GlassCard>
              ) : null}
            </aside>
          </div>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}
