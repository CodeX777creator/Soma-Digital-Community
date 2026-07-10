"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/providers/AuthProvider";
import { authFetch } from "@/lib/clientApi";
import {
  ArrowLeft,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Trash2,
  TestTube2,
  Plus,
} from "lucide-react";

type Provider = {
  providerId: string;
  label: string;
  supports: Record<string, boolean>;
};

type Connection = {
  providerId: string;
  enabled: boolean;
  verified: boolean;
  defaultModel?: string;
  mode: string;
  lastTestedAt?: string | null;
  lastError?: string | null;
};

type ProviderPayload = {
  providers: Provider[];
  connections: Connection[];
};

const PROVIDER_MODE_OPTIONS = [
  { label: "Hybrid", value: "hybrid" },
  { label: "Use Credits", value: "credits" },
  { label: "Use My Keys", value: "byok" },
];

export default function AIProvidersPage() {
  const { user } = useAuth();
  const [payload, setPayload] = useState<ProviderPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingProvider, setSavingProvider] = useState<string | null>(null);
  const [form, setForm] = useState({
    providerId: "openai",
    apiKey: "",
    defaultModel: "",
    mode: "hybrid",
  });

  const loadProviders = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const response = await authFetch("/api/ai/providers");
      setPayload((await response.json()) as ProviderPayload);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProviders();
  }, [user?.uid]);

  const selectedProvider = useMemo(() => {
    return payload?.providers.find((item) => item.providerId === form.providerId) || null;
  }, [payload, form.providerId]);

  const saveProvider = async () => {
    setSavingProvider(form.providerId);
    try {
      await authFetch("/api/ai/providers", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm((current) => ({ ...current, apiKey: "" }));
      await loadProviders();
    } finally {
      setSavingProvider(null);
    }
  };

  const testProvider = async (providerId: string) => {
    setSavingProvider(providerId);
    try {
      await authFetch(`/api/ai/providers/${providerId}`, {
        method: "POST",
        body: JSON.stringify({ action: "test" }),
      });
      await loadProviders();
    } finally {
      setSavingProvider(null);
    }
  };

  const removeProvider = async (providerId: string) => {
    setSavingProvider(providerId);
    try {
      await authFetch(`/api/ai/providers/${providerId}`, { method: "DELETE" });
      await loadProviders();
    } finally {
      setSavingProvider(null);
    }
  };

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="mx-auto flex max-w-6xl flex-col gap-8 py-8">
          <div className="flex flex-col gap-4">
            <Link href="/settings" className="flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-white">
              <ArrowLeft className="h-4 w-4" />
              Back to Settings
            </Link>
            <div className="flex items-end justify-between gap-4">
              <div>
                <h1 className="text-4xl font-bold">Connected AI Providers</h1>
                <p className="mt-2 text-muted-foreground">
                  Connect your own API keys or let SDC manage the model routing for you.
                </p>
              </div>
              <Button variant="outline" onClick={loadProviders} disabled={loading}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>

          {loading && <GlassCard className="p-6 text-sm text-muted-foreground">Loading provider connections...</GlassCard>}

          {payload && (
            <>
              <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
                <GlassCard className="p-6">
                  <div className="mb-4 flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-cyan-400" />
                    <h2 className="text-lg font-semibold">Add or update a provider</h2>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Provider</Label>
                      <Select value={form.providerId} onValueChange={(value) => setForm((current) => ({ ...current, providerId: value }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a provider" />
                        </SelectTrigger>
                        <SelectContent>
                          {payload.providers.map((provider) => (
                            <SelectItem key={provider.providerId} value={provider.providerId}>
                              {provider.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Mode</Label>
                      <Select value={form.mode} onValueChange={(value) => setForm((current) => ({ ...current, mode: value }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select mode" />
                        </SelectTrigger>
                        <SelectContent>
                          {PROVIDER_MODE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>API key</Label>
                      <Input
                        value={form.apiKey}
                        onChange={(event) => setForm((current) => ({ ...current, apiKey: event.target.value }))}
                        type="password"
                        placeholder="Paste your key here"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Default model</Label>
                      <Input
                        value={form.defaultModel}
                        onChange={(event) => setForm((current) => ({ ...current, defaultModel: event.target.value }))}
                        placeholder={selectedProvider ? `${selectedProvider.label} model` : "Optional"}
                      />
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Button onClick={saveProvider} disabled={savingProvider !== null || !form.apiKey.trim()}>
                      <Plus className="mr-2 h-4 w-4" />
                      Save provider
                    </Button>
                    <div className="rounded-lg border border-white/10 px-3 py-2 text-xs text-muted-foreground">
                      Keys are encrypted at rest and never returned to the browser.
                    </div>
                  </div>
                </GlassCard>

                <GlassCard className="p-6">
                  <div className="mb-4 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-cyan-400" />
                    <h2 className="text-lg font-semibold">Routing defaults</h2>
                  </div>
                  <div className="space-y-3 text-sm text-muted-foreground">
                    <p>Use SDC Credits for predictable profitability.</p>
                    <p>Use My API Keys when users bring their own credentials.</p>
                    <p>Hybrid mode lets SDC choose the best available path.</p>
                  </div>
                </GlassCard>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {payload.providers.map((provider) => {
                  const connection = payload.connections.find((item) => item.providerId === provider.providerId);

                  return (
                    <GlassCard key={provider.providerId} className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold">{provider.label}</h3>
                          <p className="text-xs text-muted-foreground">{provider.providerId}</p>
                        </div>
                        <Badge variant={connection?.verified ? "default" : "outline"} className="uppercase">
                          {connection?.verified ? "verified" : "not verified"}
                        </Badge>
                      </div>
                      <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                        <p>Mode: {connection?.mode || "hybrid"}</p>
                        <p>Enabled: {connection?.enabled ? "Yes" : "No"}</p>
                        <p>Last test: {connection?.lastTestedAt ? new Date(connection.lastTestedAt).toLocaleString() : "Not tested"}</p>
                        {connection?.lastError && <p className="text-red-300">{connection.lastError}</p>}
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => testProvider(provider.providerId)} disabled={savingProvider === provider.providerId}>
                          <TestTube2 className="mr-2 h-4 w-4" />
                          Test
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => removeProvider(provider.providerId)} disabled={savingProvider === provider.providerId}>
                          <Trash2 className="mr-2 h-4 w-4" />
                          Remove
                        </Button>
                      </div>
                    </GlassCard>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}
