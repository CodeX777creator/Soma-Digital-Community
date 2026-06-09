"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { sendPasswordResetEmail, signOut, updateProfile } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { dbService } from "@/lib/db";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useAuth } from "@/providers/AuthProvider";
import { useToast } from "@/hooks/use-toast";
import { Edit2, Check, LogOut, Key } from "lucide-react";

const PROFILE_FIELDS = [
  "displayName",
  "bio",
  "jobTitle",
  "company",
  "website",
  "avatarURL",
] as const;

export default function ProfilePage() {
  const router = useRouter();
  const { user, userData, refreshProfile } = useAuth();
  const { toast } = useToast();

  const [editMode, setEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPasswordSending, setIsPasswordSending] = useState(false);
  const [form, setForm] = useState({
    displayName: "",
    bio: "",
    jobTitle: "",
    company: "",
    website: "",
    avatarURL: "",
  });
  const [avatarPreview, setAvatarPreview] = useState<string>("");

  useEffect(() => {
    if (!user) return;
    setForm({
      displayName: userData?.name || user.displayName || "",
      bio: userData?.bio || "",
      jobTitle: userData?.jobTitle || "",
      company: userData?.company || "",
      website: userData?.website || "",
      avatarURL: userData?.avatarURL || user.photoURL || "",
    });
    setAvatarPreview(userData?.avatarURL || user.photoURL || "");
  }, [user, userData]);

  const completion = useMemo(() => {
    const filled = PROFILE_FIELDS.reduce((count, key) => {
      const value = form[key];
      return value?.trim() ? count + 1 : count;
    }, 0);
    return {
      filled,
      total: PROFILE_FIELDS.length,
      percent: Math.round((filled / PROFILE_FIELDS.length) * 100),
    };
  }, [form]);

  const handleFieldChange = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAvatarFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      setForm((prev) => ({ ...prev, avatarURL: url }));
      setAvatarPreview(url);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);

    try {
      const profileData = {
        name: form.displayName,
        bio: form.bio,
        jobTitle: form.jobTitle,
        company: form.company,
        website: form.website,
        avatarURL: form.avatarURL,
      };

      await dbService.updateUserProfile(user.uid, profileData);

      if (user.displayName !== form.displayName || user.photoURL !== form.avatarURL) {
        await updateProfile(user, {
          displayName: form.displayName || user.displayName,
          photoURL: form.avatarURL || user.photoURL || null,
        });
      }

      await refreshProfile();
      toast({ title: "Profile saved", description: "Your profile changes were saved successfully." });
      setEditMode(false);
    } catch (error) {
      console.error("Profile save failed", error);
      toast({ title: "Save failed", description: "Unable to save profile. Please try again." });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (userData || user) {
      setForm({
        displayName: userData?.name || user?.displayName || "",
        bio: userData?.bio || "",
        jobTitle: userData?.jobTitle || "",
        company: userData?.company || "",
        website: userData?.website || "",
        avatarURL: userData?.avatarURL || user?.photoURL || "",
      });
      setAvatarPreview(userData?.avatarURL || user?.photoURL || "");
    }
    setEditMode(false);
  };

  const handleChangePassword = async () => {
    if (!user?.email) return;
    setIsPasswordSending(true);
    try {
      await sendPasswordResetEmail(auth, user.email);
      toast({ title: "Password reset sent", description: `A reset link was sent to ${user.email}.` });
    } catch (error) {
      console.error("Password reset failed", error);
      toast({ title: "Reset failed", description: "Unable to send reset email." });
    } finally {
      setIsPasswordSending(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.push("/");
  };

  if (!user) return null;

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="max-w-5xl mx-auto flex flex-col gap-8 animate-in fade-in duration-700 py-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-4xl font-bold font-headline">Profile</h1>
              <p className="text-muted-foreground mt-2">Manage your public profile, account settings, and security preferences.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button onClick={() => setEditMode((prev) => !prev)} className="h-12 px-5" variant={editMode ? "secondary" : "default"}>
                <Edit2 className="w-4 h-4 mr-2" /> {editMode ? "Cancel" : "Edit Profile"}
              </Button>
              <Button onClick={handleLogout} className="h-12 px-5" variant="outline">
                <LogOut className="w-4 h-4 mr-2" /> Logout
              </Button>
            </div>
          </div>

          <GlassCard className="p-6 bg-white/5 border border-white/10">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-bold">Profile completion</h2>
                  <p className="text-sm text-muted-foreground">Complete your profile to unlock stronger personalization.</p>
                </div>
                <div className="text-sm font-bold text-white">{completion.filled}/{completion.total} fields filled</div>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${completion.percent}%` }} />
              </div>
            </div>
          </GlassCard>

          <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
            <GlassCard className="p-6 flex flex-col items-center gap-4 text-center bg-white/5 border-white/10">
              <UserAvatar src={avatarPreview || user.photoURL || ""} name={form.displayName || user.displayName || "Explorer"} size="xl" className="border-primary/40 blue-glow" />
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Account</p>
                <h3 className="text-2xl font-bold">{form.displayName || user.displayName || "Explorer"}</h3>
                <p className="text-sm text-muted-foreground">{user.email}</p>
              </div>
              <Button onClick={handleChangePassword} className="w-full mt-3" disabled={isPasswordSending} variant="secondary">
                <Key className="w-4 h-4 mr-2" /> Change Password
              </Button>
            </GlassCard>

            <GlassCard className="p-6 bg-white/5 border-white/10">
              <div className="grid gap-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Display Name</label>
                  <Input
                    value={form.displayName}
                    disabled={!editMode}
                    onChange={(event) => handleFieldChange("displayName", event.target.value)}
                    placeholder="Your public name"
                  />
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Bio</label>
                  <textarea
                    value={form.bio}
                    disabled={!editMode}
                    onChange={(event) => handleFieldChange("bio", event.target.value)}
                    placeholder="A short bio about you"
                    className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-base text-white outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Job Title</label>
                  <Input
                    value={form.jobTitle}
                    disabled={!editMode}
                    onChange={(event) => handleFieldChange("jobTitle", event.target.value)}
                    placeholder="e.g. Founder, Head of Growth"
                  />
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Company</label>
                  <Input
                    value={form.company}
                    disabled={!editMode}
                    onChange={(event) => handleFieldChange("company", event.target.value)}
                    placeholder="Your company or organization"
                  />
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Website</label>
                  <Input
                    value={form.website}
                    disabled={!editMode}
                    onChange={(event) => handleFieldChange("website", event.target.value)}
                    placeholder="https://your-site.com"
                  />
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Avatar URL</label>
                  <Input
                    value={form.avatarURL}
                    disabled={!editMode}
                    onChange={(event) => handleFieldChange("avatarURL", event.target.value)}
                    placeholder="https://... or upload a file"
                  />
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Upload Avatar</label>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={!editMode}
                    onChange={handleAvatarFile}
                    className="text-sm text-muted-foreground file:mr-4 file:rounded-full file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white/80"
                  />
                </div>
              </div>

              {editMode && (
                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <Button onClick={handleCancel} variant="secondary" className="h-12 px-6">
                    Cancel
                  </Button>
                  <Button onClick={handleSave} disabled={isSaving} className="h-12 px-6">
                    <Check className="w-4 h-4 mr-2" /> {isSaving ? "Saving..." : "Save Profile"}
                  </Button>
                </div>
              )}
            </GlassCard>
          </div>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}
