"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode, FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, ChevronDown, ChevronUp, ExternalLink, Facebook, Instagram, Loader2, Send, Shield, Smartphone, Trash2, Youtube, Linkedin, X, Music4 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/providers/AuthProvider";
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

type SocialAccountResponse = {
  socialAccount: SocialAccountRecord;
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

interface SocialHubFormState {
  providerId: SocialPlatform;
  connectionType: "oauth" | "manual" | "imported";
  accountName: string;
  handle: string;
  providerAccountId: string;
  notes: string;
  timezone: string;
  scopes: string;
  accessToken: string;
  refreshToken: string;
  externalAccountId: string;
  expiresInSeconds: string;
  tokenType: string;
}

const DEFAULT_PROVIDER: SocialPlatform = "instagram";

const PLATFORM_ICON: Record<SocialPlatform, ReactNode> = {
  tiktok: <Smartphone className="h-4 w-4" />,
  instagram: <Instagram className="h-4 w-4" />,
  facebook: <Facebook className="h-4 w-4" />,
  linkedin: <Linkedin className="h-4 w-4" />,
  x: <X className="h-4 w-4" />,
  youtube: <Youtube className="h-4 w-4" />,
};

function formatDate(value?: string | null): string {
  if (!value) return "Not available";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function statusClass(status: SocialAccountRecord["status"]): string {
  switch (status) {
    case "connected":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/25";
    case "pending":
      return "bg-amber-500/15 text-amber-300 border-amber-500/25";
    case "expired":
      return "bg-orange-500/15 text-orange-300 border-orange-500/25";
    case "disconnected":
      return "bg-white/5 text-white/45 border-white/10";
    case "error":
      return "bg-red-500/15 text-red-300 border-red-500/25";
    default:
      return "bg-white/5 text-white/70 border-white/10";
  }
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
  const [showAdvancedCredentials, setShowAdvancedCredentials] = useState(false);
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
  const [form, setForm] = useState<SocialHubFormState>({
    providerId: DEFAULT_PROVIDER,
    connectionType: "oauth",
    accountName: "",
    handle: "",
    providerAccountId: "",
    notes: "",
    timezone: "",
    scopes: "",
    accessToken: "",
    refreshToken: "",
    externalAccountId: "",
    expiresInSeconds: "",
    tokenType: "bearer",
  });

  const activeProvider = useMemo(
    () => providers.find((provider) => provider.id === form.providerId) || providers[0],
    [form.providerId, providers]
  );

  const loadAccounts = async () => {
    if (!user) return;

    const idToken = await user.getIdToken();
    const response = await fetch("/api/social/accounts?limit=24", {
      headers: { Authorization: `Bearer ${idToken}` },
    });

    if (!response.ok) {
      throw new Error("Could not load social accounts.");
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
          throw new Error("Could not load social accounts.");
        }

        const data = (await response.json()) as SocialHubResponse;
        if (mounted) {
          setAccounts(data.accounts || []);
          setProviders(data.providers || SOCIAL_PROVIDER_REGISTRY);
          setSummary(data.summary);
        }
      } catch (error) {
        if (mounted) {
          toast({
            title: "Social hub unavailable",
            description: error instanceof Error ? error.message : "Could not load connected accounts.",
            variant: "destructive",
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

  const updateField = <K extends keyof SocialHubFormState>(key: K, value: SocialHubFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const resetForm = () => {
    setForm({
      providerId: DEFAULT_PROVIDER,
      connectionType: "oauth",
      accountName: "",
      handle: "",
      providerAccountId: "",
      notes: "",
      timezone: "",
      scopes: "",
      accessToken: "",
      refreshToken: "",
      externalAccountId: "",
      expiresInSeconds: "",
      tokenType: "bearer",
    });
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || loading) return;

    try {
      setLoading(true);
      const idToken = await user.getIdToken();
      const response = await fetch("/api/social/accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          providerId: form.providerId,
          connectionType: form.connectionType,
          accountName: form.accountName,
          handle: form.handle || undefined,
          providerAccountId: form.providerAccountId || undefined,
          notes: form.notes || undefined,
          timezone: form.timezone || undefined,
          scopes: form.scopes
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
          credentials: form.accessToken || form.refreshToken || form.externalAccountId
            ? {
                accessToken: form.accessToken || undefined,
                refreshToken: form.refreshToken || undefined,
                externalAccountId: form.externalAccountId || undefined,
                expiresInSeconds: form.expiresInSeconds ? Number(form.expiresInSeconds) : undefined,
                tokenType: form.tokenType || undefined,
              }
            : undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Connection failed.");
      }

      await loadAccounts();
      resetForm();
      toast({
        title: "Account connected",
        description: "The social account has been stored securely.",
      });
    } catch (error) {
      toast({
        title: "Connection failed",
        description: error instanceof Error ? error.message : "The social connection could not be saved.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const startOAuthHandshake = async () => {
    if (!user || loading) return;

    try {
      setLoading(true);
      const idToken = await user.getIdToken();
      const response = await fetch(`/api/social/oauth/${form.providerId}/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          accountName: form.accountName || `${activeProvider?.label || form.providerId} account`,
          handle: form.handle || undefined,
          providerAccountId: form.providerAccountId || undefined,
          scopes: form.scopes
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
          returnTo: "/social",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "OAuth handoff could not be prepared.");
      }

      const data = (await response.json()) as OAuthStartResponse;
      setOAuthHandshake(data);
      if (data.authorizationUrl) {
        window.open(data.authorizationUrl, "_blank", "noopener,noreferrer");
      }
      await loadAccounts();
      toast({
        title: "OAuth handoff prepared",
        description: data.authorizationUrl
          ? "The provider authorization window has been opened."
          : "Provider authorization URL is not configured yet, but the callback handoff is ready.",
      });
    } catch (error) {
      toast({
        title: "OAuth handoff failed",
        description: error instanceof Error ? error.message : "Could not prepare the OAuth connection.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
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
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Disconnect failed.");
      }

      await loadAccounts();
      toast({
        title: "Account disconnected",
        description: "Credentials were cleared and the connection was archived.",
      });
    } catch (error) {
      toast({
        title: "Disconnect failed",
        description: error instanceof Error ? error.message : "The social connection could not be updated.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Social Media Hub</h1>
                <p className="text-sm text-muted-foreground">
                  Manage connected accounts, secure OAuth credentials, and prepare the platform layer for publishing.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href="/social/calendar">
                    <CalendarDays className="h-4 w-4" />
                    Calendar
                  </Link>
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={loadAccounts} disabled={loadingHistory || loading}>
                  {loadingHistory ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Refresh
                </Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <GlassCard className="p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Connected</div>
                <div className="mt-2 text-2xl font-semibold">{summary.connectedAccounts}</div>
              </GlassCard>
              <GlassCard className="p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Pending</div>
                <div className="mt-2 text-2xl font-semibold">{summary.pendingAccounts}</div>
              </GlassCard>
              <GlassCard className="p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Needs attention</div>
                <div className="mt-2 text-2xl font-semibold">{summary.expiredAccounts + summary.disconnectedAccounts}</div>
              </GlassCard>
              <GlassCard className="p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Providers</div>
                <div className="mt-2 text-2xl font-semibold">{providers.length}</div>
              </GlassCard>
            </div>

            <GlassCard className="p-5">
              <form className="space-y-4" onSubmit={handleCreate}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Provider</label>
                    <select
                      className={cn("h-10 w-full rounded-md border border-input bg-background px-3 text-sm")}
                      value={form.providerId}
                      onChange={(event) => updateField("providerId", event.target.value as SocialPlatform)}
                    >
                      {providers.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Account name</label>
                    <Input value={form.accountName} onChange={(event) => updateField("accountName", event.target.value)} placeholder="Soma Digital" />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Handle</label>
                    <Input value={form.handle} onChange={(event) => updateField("handle", event.target.value)} placeholder="@somadigital" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Timezone</label>
                    <Input value={form.timezone} onChange={(event) => updateField("timezone", event.target.value)} placeholder="Africa/Nairobi" />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Connection type</label>
                    <select
                      className={cn("h-10 w-full rounded-md border border-input bg-background px-3 text-sm")}
                      value={form.connectionType}
                      onChange={(event) => updateField("connectionType", event.target.value as SocialHubFormState["connectionType"])}
                    >
                      <option value="oauth">OAuth connection</option>
                      <option value="manual">Manual connection</option>
                      <option value="imported">Imported credentials</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Provider account ID</label>
                    <Input value={form.providerAccountId} onChange={(event) => updateField("providerAccountId", event.target.value)} placeholder={form.connectionType === "oauth" ? "Assigned by provider" : "External provider ID"} />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Scopes</label>
                  <Input value={form.scopes} onChange={(event) => updateField("scopes", event.target.value)} placeholder="Comma-separated scopes or permissions" />
                </div>

                <div className="rounded-md border border-white/10 bg-white/[0.03] p-4">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between text-left"
                    onClick={() => setShowAdvancedCredentials((current) => !current)}
                  >
                    <div>
                      <div className="text-sm font-medium">Advanced credentials</div>
                      <div className="text-xs text-muted-foreground">Only use this when importing an existing connection.</div>
                    </div>
                    {showAdvancedCredentials ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </button>

                  {showAdvancedCredentials && (
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Access token</label>
                        <Input
                          type="password"
                          value={form.accessToken}
                          onChange={(event) => updateField("accessToken", event.target.value)}
                          placeholder="Optional"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Refresh token</label>
                        <Input
                          type="password"
                          value={form.refreshToken}
                          onChange={(event) => updateField("refreshToken", event.target.value)}
                          placeholder="Optional"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">External account ID</label>
                    <Input value={form.externalAccountId} onChange={(event) => updateField("externalAccountId", event.target.value)} placeholder="Optional" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Token type</label>
                    <Input value={form.tokenType} onChange={(event) => updateField("tokenType", event.target.value)} placeholder="bearer" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Expires in seconds</label>
                    <Input value={form.expiresInSeconds} onChange={(event) => updateField("expiresInSeconds", event.target.value)} placeholder="3600" inputMode="numeric" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Notes</label>
                  <Textarea value={form.notes} onChange={(event) => updateField("notes", event.target.value)} rows={3} placeholder={`Current connection mode for ${activeProvider?.label || "this provider"}.`} />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button type="submit" disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                    Save Connection
                  </Button>
                  <Button type="button" variant="outline" onClick={startOAuthHandshake} disabled={loading || form.connectionType !== "oauth"}>
                    <ExternalLink className="h-4 w-4" />
                    Start OAuth
                  </Button>
                  <Button type="button" variant="outline" onClick={resetForm} disabled={loading}>
                    Clear
                  </Button>
                </div>

                {oauthHandshake ? (
                  <div className="rounded-md border border-border p-3 text-sm">
                    <div className="font-medium">OAuth handoff ready</div>
                    <div className="mt-1 text-muted-foreground">
                      {oauthHandshake.authorizationUrl
                        ? "Authorization is configured. The provider window should open now."
                        : "The callback handoff is ready, but provider authorization still needs to be configured."}
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">Callback: {oauthHandshake.callbackUrl}</div>
                  </div>
                ) : null}
              </form>
            </GlassCard>
          </section>

          <section className="space-y-6">
            <GlassCard className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Provider overview</h2>
                  <p className="text-sm text-muted-foreground">Connected accounts are stored as encrypted records in Firestore.</p>
                </div>
                <Music4 className="h-5 w-5 text-primary" />
              </div>

              <div className="mt-4 grid gap-3">
                {providers.map((provider) => (
                  <div key={provider.id} className="flex items-start justify-between gap-4 rounded-md border border-white/10 bg-white/5 p-4">
                    <div className="flex items-start gap-3">
                      <div className="rounded-md border border-white/10 bg-black/20 p-2 text-primary">
                        {PLATFORM_ICON[provider.id]}
                      </div>
                      <div>
                        <div className="font-medium">{provider.label}</div>
                        <div className="text-sm text-muted-foreground">{provider.description}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{provider.notes}</div>
                      </div>
                    </div>
                    <div className="text-right text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      {summary.byProvider[provider.id] || 0} linked
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>

            <GlassCard className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Connected accounts</h2>
                  <p className="text-sm text-muted-foreground">Use this list to audit active, pending, and disconnected connections.</p>
                </div>
                <CheckCircle2 className="h-5 w-5 text-primary" />
              </div>

              <div className="mt-4 space-y-3">
                {accounts.length === 0 ? (
                  <div className="rounded-md border border-dashed border-white/10 p-6 text-sm text-muted-foreground">
                    No connected social accounts yet.
                  </div>
                ) : (
                  accounts.map((account) => (
                    <div key={account.socialAccountId} className="rounded-md border border-white/10 bg-white/5 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className="rounded-md border border-white/10 bg-black/20 p-2 text-primary">
                            {PLATFORM_ICON[account.providerId]}
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="font-medium">{account.accountName}</div>
                              <span className={cn("rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em]", statusClass(account.status))}>
                                {account.status}
                              </span>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {account.providerLabel}{account.handle ? ` - ${account.handle}` : ""}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {account.hasCredentials ? "Encrypted credentials stored" : "No credentials stored"}
                              {account.expiresAt ? ` - Expires ${formatDate(account.expiresAt)}` : ""}
                            </div>
                          </div>
                        </div>
                        <Button type="button" variant="ghost" size="icon" onClick={() => disconnectAccount(account.socialAccountId)} disabled={loading}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
                        <div>Connection type: {account.connectionType || "oauth"}</div>
                        <div>Account ID: {account.providerAccountId || "Not set"}</div>
                        <div>Timezone: {account.timezone || "Not set"}</div>
                        <div>Scopes: {account.scopes.length > 0 ? account.scopes.join(", ") : "Not set"}</div>
                        <div>Updated: {formatDate(account.updatedAt)}</div>
                      </div>

                      {account.notes ? <div className="mt-3 text-sm text-muted-foreground">{account.notes}</div> : null}
                    </div>
                  ))
                )}
              </div>
            </GlassCard>
          </section>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}
