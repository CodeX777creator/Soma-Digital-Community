"use client";

import { ChangeEvent, DragEvent, useRef, useState } from "react";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { db } from "@/lib/firebase";
import { uploadAsset } from "@/lib/storage";
import { useAuth } from "@/providers/AuthProvider";
import { cn } from "@/lib/utils";

type AdminAssetUploadProps = {
  assetId: string;
  onUploaded?: (assetUrl: string) => void;
};

export function AdminAssetUpload({ assetId, onUploaded }: AdminAssetUploadProps) {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [assetUrl, setAssetUrl] = useState("");
  const [dragging, setDragging] = useState(false);

  const canUpload = !!user && !!assetId && !!selectedFile && !uploading;

  const selectFile = (file?: File) => {
    setError("");
    setAssetUrl("");
    setProgress(0);
    setSelectedFile(file || null);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    selectFile(event.target.files?.[0]);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    selectFile(event.dataTransfer.files?.[0]);
  };

  const handleUpload = async () => {
    if (!user || !selectedFile || !assetId || !db) return;

    setUploading(true);
    setError("");

    try {
      const url = await uploadAsset(
        selectedFile,
        assetId,
        {
          uploadedBy: user.uid,
          assetId,
        },
        {
          onProgress: setProgress,
        }
      );

      await setDoc(
        doc(db, "marketplaceAssets", assetId),
        {
          assetUrl: url,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setAssetUrl(url);
      onUploaded?.(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <GlassCard className="p-5 flex flex-col gap-4">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-6 text-center transition-colors",
          dragging && "border-primary bg-primary/10"
        )}
      >
        <UploadCloud className="w-8 h-8 mx-auto text-primary mb-3" />
        <p className="text-sm font-semibold">Upload marketplace asset</p>
        <p className="text-xs text-muted-foreground mt-1">PDF, MP4, ZIP, or Markdown. Maximum 50MB.</p>
        <Input
          ref={inputRef}
          type="file"
          accept=".pdf,.mp4,.zip,.md,application/pdf,video/mp4,application/zip,text/markdown"
          onChange={handleFileChange}
          className="hidden"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          className="mt-4 border-white/10 bg-white/5"
        >
          Choose File
        </Button>
      </div>

      {selectedFile && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{selectedFile.name}</p>
            <p className="text-xs text-muted-foreground">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => selectFile()}
            disabled={uploading}
            className="shrink-0"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {uploading && (
        <div className="space-y-2">
          <Progress value={progress} className="h-2 bg-white/10" />
          <p className="text-xs text-muted-foreground">{progress}% uploaded</p>
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
      {assetUrl && <p className="text-sm text-green-400 break-all">Uploaded and linked: {assetUrl}</p>}

      <Button type="button" onClick={handleUpload} disabled={!canUpload} className="w-full">
        {uploading ? "Uploading..." : "Upload and Link Asset"}
      </Button>
    </GlassCard>
  );
}
