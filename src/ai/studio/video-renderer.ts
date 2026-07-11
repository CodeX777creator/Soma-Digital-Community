import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { logger } from '@/lib/logger';
import type { VideoAspectRatio, VideoScene, VideoStylePreset } from './types';

export type VideoRendererStrategy = 'ffmpeg' | 'cloud' | 'bundle';

export interface VideoRenderManifest {
  title: string;
  prompt: string;
  renderPrompt: string;
  scenes: VideoScene[];
  stylePreset: VideoStylePreset;
  aspectRatio: VideoAspectRatio;
  durationSeconds: number;
  captionsEnabled: boolean;
  voiceoverScript: string;
  thumbnailPrompt: string;
  renderNotes?: string;
  brandName?: string;
  brandTemplateName?: string;
  voiceoverTone?: string;
}

export interface VideoRenderResult {
  renderer: VideoRendererStrategy;
  status: 'completed' | 'queued' | 'failed';
  mimeType: string;
  videoBuffer?: Buffer;
  sourceUrl?: string;
  jobId?: string;
  posterFrameBuffer?: Buffer;
  posterFrameMimeType?: string;
  raw?: unknown;
  notes?: string;
}

const FFMPEG_PROBE_CACHE = new Map<string, Promise<boolean>>();

function resolveRendererMode(): 'auto' | 'ffmpeg' | 'cloud' | 'bundle' {
  const mode = (process.env.VIDEO_RENDERER_MODE || 'auto').toLowerCase();
  if (mode === 'ffmpeg' || mode === 'cloud' || mode === 'bundle') return mode;
  return 'auto';
}

function resolveFfmpegPath(): string {
  return process.env.VIDEO_RENDERER_FFMPEG_PATH || 'ffmpeg';
}

function hasCloudRenderer(): boolean {
  return Boolean(process.env.VIDEO_RENDER_SERVICE_URL);
}

function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/,/g, '\\,')
    .replace(/%/g, '\\%')
    .replace(/\r?\n/g, '\\n');
}

function resolveCanvasSize(aspectRatio: VideoAspectRatio): { width: number; height: number } {
  switch (aspectRatio) {
    case '1:1':
      return { width: 1080, height: 1080 };
    case '4:5':
      return { width: 1080, height: 1350 };
    case '9:16':
      return { width: 1080, height: 1920 };
    case '3:2':
      return { width: 1440, height: 960 };
    case '2:3':
      return { width: 1080, height: 1620 };
    case '16:9':
    default:
      return { width: 1280, height: 720 };
  }
}

function resolveSceneBackground(stylePreset: VideoStylePreset, index: number): string {
  const palette: Record<VideoStylePreset, string[]> = {
    documentary: ['0f172a', '172554', '1e293b'],
    cinematic: ['10172a', '1f2937', '312e81'],
    product_demo: ['111827', '0f766e', '1d4ed8'],
    social_reel: ['0b1020', '312e81', 'be123c'],
    youtube_explainer: ['111827', '1d4ed8', '0f766e'],
    brand_story: ['1f2937', '7c3aed', '0f172a'],
    ugc: ['111827', '374151', '0f766e'],
    event_highlight: ['111827', '7c2d12', '312e81'],
  };

  const colors = palette[stylePreset] || palette.cinematic;
  return colors[index % colors.length];
}

function buildSceneText(manifest: VideoRenderManifest, scene: VideoScene, index: number): string {
  const pieces = [
    `Scene ${index + 1}`,
    scene.visualDescription,
    scene.narration,
    scene.onScreenText ? `On-screen: ${scene.onScreenText}` : '',
    scene.cameraDirection ? `Camera: ${scene.cameraDirection}` : '',
    scene.transition ? `Transition: ${scene.transition}` : '',
    manifest.brandName ? `Brand: ${manifest.brandName}` : '',
  ].filter(Boolean);

  return pieces.join('\n');
}

function normalizeManifestScenes(manifest: VideoRenderManifest): VideoScene[] {
  if (manifest.scenes.length > 0) return manifest.scenes;

  return [
    {
      sceneNumber: 1,
      durationSeconds: Math.max(3, Math.round(manifest.durationSeconds / 3) || 5),
      visualDescription: manifest.prompt,
      narration: manifest.voiceoverScript || manifest.prompt,
      onScreenText: manifest.title,
    },
  ];
}

function buildSceneFilter(manifest: VideoRenderManifest, scene: VideoScene, index: number): string {
  const { width, height } = resolveCanvasSize(manifest.aspectRatio);
  const bg = resolveSceneBackground(manifest.stylePreset, index);
  const text = escapeDrawtext(buildSceneText(manifest, scene, index));
  const title = escapeDrawtext(manifest.title || manifest.prompt);

  return [
    `drawbox=x=0:y=0:w=iw:h=ih:color=#${bg}@1:t=fill`,
    `drawbox=x=48:y=48:w=iw-96:h=ih-96:color=black@0.32:t=fill`,
    `drawtext=fontcolor=white:fontsize=${Math.max(34, Math.round(height * 0.045))}:line_spacing=12:x=72:y=72:text='${title}'`,
    `drawtext=fontcolor=white:fontsize=${Math.max(28, Math.round(height * 0.028))}:line_spacing=10:box=1:boxcolor=black@0.28:x=72:y=160:text='${text}'`,
  ].join(',');
}

function buildPosterFilter(manifest: VideoRenderManifest): string {
  const { width, height } = resolveCanvasSize(manifest.aspectRatio);
  const scene = manifest.scenes[0];
  const text = escapeDrawtext(buildSceneText(manifest, scene, 0));
  const title = escapeDrawtext(manifest.title || manifest.prompt);

  return [
    `drawbox=x=0:y=0:w=iw:h=ih:color=#${resolveSceneBackground(manifest.stylePreset, 0)}@1:t=fill`,
    `drawbox=x=48:y=48:w=iw-96:h=ih-96:color=black@0.32:t=fill`,
    `drawtext=fontcolor=white:fontsize=${Math.max(38, Math.round(height * 0.05))}:line_spacing=12:x=72:y=72:text='${title}'`,
    `drawtext=fontcolor=white:fontsize=${Math.max(26, Math.round(height * 0.027))}:line_spacing=10:box=1:boxcolor=black@0.28:x=72:y=160:text='${text}'`,
  ].join(',');
}

function spawnProcess(command: string, args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(stderr.trim() || `Renderer exited with code ${code}`));
    });
  });
}

async function probeFfmpeg(): Promise<boolean> {
  const ffmpegPath = resolveFfmpegPath();
  if (!FFMPEG_PROBE_CACHE.has(ffmpegPath)) {
    FFMPEG_PROBE_CACHE.set(
      ffmpegPath,
      spawnProcess(ffmpegPath, ['-version'])
        .then(() => true)
        .catch(() => false)
    );
  }

  return FFMPEG_PROBE_CACHE.get(ffmpegPath)!;
}

async function renderWithFfmpeg(manifest: VideoRenderManifest): Promise<VideoRenderResult> {
  const ffmpegPath = resolveFfmpegPath();
  const probe = await probeFfmpeg();
  if (!probe) {
    return {
      renderer: 'ffmpeg',
      status: 'failed',
      mimeType: 'application/json',
      notes: 'ffmpeg is not available on this host.',
    };
  }

  const scenes = normalizeManifestScenes(manifest);
  const sceneCount = Math.max(scenes.length, 1);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sdc-video-'));
  const outputPath = path.join(tempDir, 'render.mp4');
  const posterPath = path.join(tempDir, 'poster.png');
  const { width, height } = resolveCanvasSize(manifest.aspectRatio);
  const fps = 30;

  try {
    const args: string[] = ['-y'];
    scenes.forEach((scene) => {
      args.push('-f', 'lavfi', '-i', `color=c=#${resolveSceneBackground(manifest.stylePreset, scene.sceneNumber - 1)}:s=${width}x${height}:r=${fps}:d=${Math.max(3, scene.durationSeconds)}`);
    });

    const filterParts: string[] = scenes.map((scene, index) => {
      const label = `v${index}`;
      return `[${index}:v]${buildSceneFilter(manifest, scene, index)}[${label}]`;
    });
    const concatInputs = scenes.map((_, index) => `[v${index}]`).join('');
    filterParts.push(`${concatInputs}concat=n=${sceneCount}:v=1:a=0[outv]`);

    args.push(
      '-filter_complex',
      filterParts.join(';'),
      '-map',
      '[outv]',
      '-r',
      String(fps),
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      outputPath
    );

    await spawnProcess(ffmpegPath, args, tempDir);

    const videoBuffer = await fs.readFile(outputPath);
    const posterArgs = [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `color=c=#${resolveSceneBackground(manifest.stylePreset, 0)}:s=${width}x${height}:r=${fps}:d=1`,
      '-vf',
      buildPosterFilter({ ...manifest, scenes }),
      '-frames:v',
      '1',
      posterPath,
    ];

    await spawnProcess(ffmpegPath, posterArgs, tempDir);
    const posterFrameBuffer = await fs.readFile(posterPath);

    return {
      renderer: 'ffmpeg',
      status: 'completed',
      mimeType: 'video/mp4',
      videoBuffer,
      posterFrameBuffer,
      posterFrameMimeType: 'image/png',
    };
  } catch (error) {
    logger.warn('[VideoRenderer] ffmpeg render failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      renderer: 'ffmpeg',
      status: 'failed',
      mimeType: 'application/json',
      notes: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function renderWithCloud(manifest: VideoRenderManifest): Promise<VideoRenderResult> {
  const endpoint = process.env.VIDEO_RENDER_SERVICE_URL;
  if (!endpoint) {
    return {
      renderer: 'cloud',
      status: 'failed',
      mimeType: 'application/json',
      notes: 'No cloud render endpoint configured.',
    };
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.VIDEO_RENDER_SERVICE_TOKEN ? { Authorization: `Bearer ${process.env.VIDEO_RENDER_SERVICE_TOKEN}` } : {}),
    },
    body: JSON.stringify({
      manifest,
      preferredFormat: 'video/mp4',
      thumbnailFormat: 'image/png',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(errorText || `Cloud renderer responded with ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('video/')) {
    return {
      renderer: 'cloud',
      status: 'completed',
      mimeType: contentType,
      videoBuffer: Buffer.from(await response.arrayBuffer()),
    };
  }

  const payload = await response.json();
  const raw = payload as Record<string, any>;
  const videoBase64 = typeof raw.videoBase64 === 'string' ? raw.videoBase64 : typeof raw.base64 === 'string' ? raw.base64 : undefined;
  const posterFrameBase64 = typeof raw.posterFrameBase64 === 'string' ? raw.posterFrameBase64 : typeof raw.thumbnailBase64 === 'string' ? raw.thumbnailBase64 : undefined;
  const sourceUrl = typeof raw.videoUrl === 'string' ? raw.videoUrl : typeof raw.downloadUrl === 'string' ? raw.downloadUrl : undefined;
  const status = raw.status === 'queued' ? 'queued' : raw.status === 'failed' ? 'failed' : 'completed';

  return {
    renderer: 'cloud',
    status,
    mimeType: typeof raw.mimeType === 'string' ? raw.mimeType : 'video/mp4',
    ...(videoBase64 ? { videoBuffer: Buffer.from(videoBase64, 'base64') } : {}),
    ...(posterFrameBase64 ? { posterFrameBuffer: Buffer.from(posterFrameBase64, 'base64'), posterFrameMimeType: 'image/png' } : {}),
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(typeof raw.jobId === 'string' ? { jobId: raw.jobId } : {}),
    raw,
  };
}

async function renderWithBundle(manifest: VideoRenderManifest): Promise<VideoRenderResult> {
  return {
    renderer: 'bundle',
    status: 'queued',
    mimeType: 'application/json',
    raw: {
      manifest,
      note: 'Rendered bundle is queued until a renderer worker becomes available.',
    },
    notes: 'Saved a render bundle because neither ffmpeg nor a cloud renderer was available.',
  };
}

export async function renderVideoAsset(manifest: VideoRenderManifest): Promise<VideoRenderResult> {
  const mode = resolveRendererMode();

  if (mode === 'bundle') {
    return renderWithBundle(manifest);
  }

  if (mode === 'ffmpeg') {
    const local = await renderWithFfmpeg(manifest);
    if (local.status !== 'failed') return local;
    if (hasCloudRenderer()) return renderWithCloud(manifest);
    return renderWithBundle(manifest);
  }

  if (mode === 'cloud') {
    if (hasCloudRenderer()) {
      return renderWithCloud(manifest);
    }
    const local = await renderWithFfmpeg(manifest);
    if (local.status !== 'failed') return local;
    return renderWithBundle(manifest);
  }

  const local = await renderWithFfmpeg(manifest);
  if (local.status !== 'failed') return local;

  if (hasCloudRenderer()) {
    const cloud = await renderWithCloud(manifest);
    if (cloud.status !== 'failed') return cloud;
  }

  return renderWithBundle(manifest);
}
