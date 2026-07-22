import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { spawn } from 'child_process';
import sharp from 'sharp';
import ffmpegPath from 'ffmpeg-static';

export type MediaKind = 'image' | 'video';

export type OptimizedMediaResult = {
  kind: MediaKind;
  mimeType: string;
  extension: string;
  buffer: Buffer;
  sizeBytes: number;
  originalSizeBytes: number;
  optimizationMode: 'image-optimize' | 'video-transcode' | 'passthrough';
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  thumbnail?: Buffer | null;
  thumbnailMimeType?: string | null;
  thumbnailExtension?: string | null;
  thumbnailSizeBytes?: number | null;
  notes: string[];
};

export type MediaOptimizationProfile = 'standard' | 'high_quality' | 'aggressive';

function normalizeExtension(extension: string, fallback: string) {
  const clean = extension.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return clean || fallback;
}

function getImageTargetMime(inputMime: string) {
  if (inputMime === 'image/png') return 'image/png';
  if (inputMime === 'image/webp') return 'image/webp';
  if (inputMime === 'image/gif') return 'image/gif';
  return 'image/jpeg';
}

async function optimizeImage(buffer: Buffer, inputMime: string, inputName: string): Promise<OptimizedMediaResult> {
  const image = sharp(buffer, { failOn: 'none' }).rotate();
  const metadata = await image.metadata();
  const width = metadata.width || null;
  const height = metadata.height || null;
  const targetMime = getImageTargetMime(inputMime);
  const extension = targetMime === 'image/png' ? 'png' : targetMime === 'image/webp' ? 'webp' : targetMime === 'image/gif' ? 'gif' : 'jpg';
  const pipeline = image.resize({
    width: width && width > 3840 ? 3840 : undefined,
    height: height && height > 3840 ? 3840 : undefined,
    fit: 'inside',
    withoutEnlargement: true,
  });

  let output: Buffer;
  if (targetMime === 'image/png') {
    output = await pipeline.png({ compressionLevel: 9, adaptiveFiltering: true, force: false }).toBuffer();
  } else if (targetMime === 'image/webp') {
    output = await pipeline.webp({ quality: 85, effort: 4 }).toBuffer();
  } else if (targetMime === 'image/gif') {
    output = await pipeline.gif().toBuffer();
  } else {
    output = await pipeline.jpeg({ quality: 84, mozjpeg: true }).toBuffer();
  }

  const notes = ['Image optimized for delivery', `Source: ${normalizeExtension(path.extname(inputName).slice(1), 'img')}`];
  if (output.length < buffer.length) {
    notes.push(`Reduced from ${(buffer.length / 1024 / 1024).toFixed(1)}MB to ${(output.length / 1024 / 1024).toFixed(1)}MB`);
  } else {
    notes.push('Optimized image preserved original quality settings');
  }

  return {
    kind: 'image',
    mimeType: targetMime,
    extension,
    buffer: output,
    sizeBytes: output.length,
    originalSizeBytes: buffer.length,
    optimizationMode: 'image-optimize',
    width,
    height,
    durationSeconds: null,
    thumbnail: null,
    thumbnailMimeType: null,
    thumbnailExtension: null,
    thumbnailSizeBytes: null,
    notes,
  };
}

async function runFfmpeg(args: string[]) {
  const ffmpegBinary = ffmpegPath || '';
  if (!ffmpegBinary) {
    throw new Error('ffmpeg is unavailable');
  }

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(ffmpegBinary, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] as const }) as any;
    let stderrText = '';
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderrText += chunk.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code: number) => {
      if (code === 0) resolve();
      else reject(new Error(stderrText || `ffmpeg exited with code ${code}`));
    });
  });
}

function getVideoProfile(profile: MediaOptimizationProfile) {
  if (profile === 'aggressive') {
    return {
      maxWidth: 960,
      crf: 30,
      audioBitrate: '96k',
      preset: 'faster',
    };
  }

  if (profile === 'high_quality') {
    return {
      maxWidth: 1920,
      crf: 22,
      audioBitrate: '160k',
      preset: 'slow',
    };
  }

  return {
    maxWidth: 1280,
    crf: 26,
    audioBitrate: '128k',
    preset: 'veryfast',
  };
}

async function optimizeVideo(buffer: Buffer, inputMime: string, inputName: string, profile: MediaOptimizationProfile): Promise<OptimizedMediaResult> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sdc-video-'));
  const inputPath = path.join(tempDir, `input-${Date.now()}-${normalizeExtension(path.extname(inputName).slice(1), 'bin')}`);
  const outputPath = path.join(tempDir, `output-${Date.now()}.mp4`);
  const thumbnailPath = path.join(tempDir, `poster-${Date.now()}.jpg`);
  await fs.writeFile(inputPath, buffer);

  try {
    const width = null;
    const height = null;
    const durationSeconds = null;
    const config = getVideoProfile(profile);

    const ffmpegArgs = [
      '-y',
      '-i', inputPath,
      '-map', '0:v:0',
      '-map', '0:a?',
      '-c:v', 'libx264',
      '-preset', config.preset,
      '-crf', String(config.crf),
      '-profile:v', 'main',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-c:a', 'aac',
      '-b:a', config.audioBitrate,
      '-max_muxing_queue_size', '1024',
      '-vf', `scale='min(${config.maxWidth},iw)':-2`,
      outputPath,
    ];

    await runFfmpeg(ffmpegArgs);
    await runFfmpeg([
      '-y',
      '-ss', '00:00:01',
      '-i', outputPath,
      '-vframes', '1',
      '-vf', 'scale=640:-2',
      thumbnailPath,
    ]);

    const optimizedBuffer = await fs.readFile(outputPath);
    const thumbnailBuffer = await fs.readFile(thumbnailPath).catch(() => null);

    const notes = ['Video transcoded for delivery', 'Container optimized for fast streaming'];
    if (optimizedBuffer.length < buffer.length) {
      notes.push(`Reduced from ${(buffer.length / 1024 / 1024).toFixed(1)}MB to ${(optimizedBuffer.length / 1024 / 1024).toFixed(1)}MB`);
    } else {
      notes.push('Video kept at delivery-friendly settings');
    }

    return {
      kind: 'video',
      mimeType: 'video/mp4',
      extension: 'mp4',
      buffer: optimizedBuffer,
      sizeBytes: optimizedBuffer.length,
      originalSizeBytes: buffer.length,
      optimizationMode: 'video-transcode',
      width,
      height,
      durationSeconds,
      thumbnail: thumbnailBuffer,
      thumbnailMimeType: thumbnailBuffer ? 'image/jpeg' : null,
      thumbnailExtension: thumbnailBuffer ? 'jpg' : null,
      thumbnailSizeBytes: thumbnailBuffer?.length ?? null,
      notes,
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function optimizeUploadedMedia(input: {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  kind: MediaKind;
  profile?: MediaOptimizationProfile;
}): Promise<OptimizedMediaResult> {
  const profile = input.profile || 'standard';
  if (input.kind === 'image') {
    return optimizeImage(input.buffer, input.mimeType, input.fileName);
  }
  return optimizeVideo(input.buffer, input.mimeType, input.fileName, profile);
}
