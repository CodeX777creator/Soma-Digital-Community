import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { logger } from '@/lib/logger';

export type AudioRendererStrategy = 'ffmpeg' | 'cloud' | 'bundle';

export interface AudioRenderManifest {
  title: string;
  prompt: string;
  narrationText: string;
  transcript?: string;
  language: string;
  voicePreset: string;
  durationSeconds: number;
  backgroundMusic: boolean;
  includeIntro: boolean;
  includeOutro: boolean;
  tone?: string;
  scriptStyle?: string;
  brandName?: string;
  brandTemplateName?: string;
  renderNotes?: string;
}

export interface AudioRenderResult {
  renderer: AudioRendererStrategy;
  status: 'completed' | 'queued' | 'failed';
  mimeType: string;
  audioBuffer?: Buffer;
  sourceUrl?: string;
  waveformPreviewBuffer?: Buffer;
  waveformPreviewMimeType?: string;
  notes?: string;
  raw?: unknown;
}

const FFMPEG_PROBE_CACHE = new Map<string, Promise<boolean>>();

function resolveRendererMode(): 'auto' | 'ffmpeg' | 'cloud' | 'bundle' {
  const mode = (process.env.AUDIO_RENDERER_MODE || 'auto').toLowerCase();
  if (mode === 'ffmpeg' || mode === 'cloud' || mode === 'bundle') return mode;
  return 'auto';
}

function resolveFfmpegPath(): string {
  return process.env.AUDIO_RENDERER_FFMPEG_PATH || 'ffmpeg';
}

function hasCloudRenderer(): boolean {
  return Boolean(process.env.AUDIO_RENDER_SERVICE_URL);
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

      reject(new Error(stderr.trim() || `Audio renderer exited with code ${code}`));
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

function shouldPostProcess(manifest: AudioRenderManifest): boolean {
  return Boolean(
    manifest.backgroundMusic ||
    manifest.includeIntro === false ||
    manifest.includeOutro === false ||
    process.env.AUDIO_RENDER_POSTPROCESS_ENABLED === 'true'
  );
}

function buildWaveformSvgBuffer(manifest: AudioRenderManifest): Buffer {
  const width = 1600;
  const height = 320;
  const bars = 48;
  const accent = manifest.backgroundMusic ? '#38bdf8' : '#8b5cf6';
  const fill = '#0f172a';
  const barWidth = Math.max(6, Math.floor((width - 120) / bars));
  const gap = 6;
  const rows = Array.from({ length: bars }, (_, index) => {
    const seed = `${manifest.prompt}|${manifest.narrationText}|${index}`;
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
      hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    }
    const amplitude = 0.18 + (hash % 80) / 100;
    const h = Math.round((height - 120) * amplitude);
    const x = 60 + index * (barWidth + gap);
    const y = Math.round((height - h) / 2);
    return `<rect x="${x}" y="${y}" width="${barWidth}" height="${h}" rx="10" fill="${accent}" opacity="${0.4 + (hash % 35) / 100}"/>`;
  }).join('');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Waveform preview">
  <rect width="100%" height="100%" fill="${fill}"/>
  <rect x="32" y="32" width="${width - 64}" height="${height - 64}" rx="24" fill="#111827" stroke="#1f2937"/>
  <text x="64" y="78" fill="#f8fafc" font-size="28" font-family="Inter, Arial, sans-serif">${manifest.title.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>
  <text x="64" y="118" fill="#94a3b8" font-size="16" font-family="Inter, Arial, sans-serif">${manifest.voicePreset} · ${manifest.language} · ${manifest.durationSeconds}s</text>
  <rect x="60" y="${height - 72}" width="${width - 120}" height="4" rx="2" fill="#334155"/>
  ${rows}
</svg>`;

  return Buffer.from(svg, 'utf8');
}

async function renderWithFfmpeg(manifest: AudioRenderManifest, audioInput?: Buffer): Promise<AudioRenderResult> {
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

  if (!audioInput) {
    return {
      renderer: 'ffmpeg',
      status: 'failed',
      mimeType: 'application/json',
      notes: 'No audio input buffer was supplied.',
    };
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sdc-audio-'));
  const inputPath = path.join(tempDir, 'input.bin');
  const outputPath = path.join(tempDir, 'output.mp3');
  const waveformPath = path.join(tempDir, 'waveform.svg');

  try {
    await fs.writeFile(inputPath, audioInput);

    const audioArgs = [
      '-y',
      '-i',
      inputPath,
      ...(shouldPostProcess(manifest) ? ['-af', 'loudnorm=I=-16:LRA=11:TP=-1.5'] : []),
      '-codec:a',
      'libmp3lame',
      '-q:a',
      '3',
      outputPath,
    ];
    await spawnProcess(ffmpegPath, audioArgs, tempDir);

    const waveformSvg = buildWaveformSvgBuffer(manifest);
    await fs.writeFile(waveformPath, waveformSvg);

    const audioBuffer = await fs.readFile(outputPath);
    const waveformPreviewBuffer = await fs.readFile(waveformPath);

    return {
      renderer: 'ffmpeg',
      status: 'completed',
      mimeType: 'audio/mpeg',
      audioBuffer,
      waveformPreviewBuffer,
      waveformPreviewMimeType: 'image/svg+xml',
    };
  } catch (error) {
    logger.warn('[AudioRenderer] ffmpeg render failed', {
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

async function renderWithCloud(manifest: AudioRenderManifest, audioInput?: Buffer): Promise<AudioRenderResult> {
  const endpoint = process.env.AUDIO_RENDER_SERVICE_URL;
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
      ...(process.env.AUDIO_RENDER_SERVICE_TOKEN ? { Authorization: `Bearer ${process.env.AUDIO_RENDER_SERVICE_TOKEN}` } : {}),
    },
    body: JSON.stringify({
      manifest,
      audioBase64: audioInput ? audioInput.toString('base64') : undefined,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(errorText || `Cloud audio renderer responded with ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('audio/')) {
    return {
      renderer: 'cloud',
      status: 'completed',
      mimeType: contentType,
      audioBuffer: Buffer.from(await response.arrayBuffer()),
    };
  }

  const payload = await response.json();
  const raw = payload as Record<string, any>;
  const audioBase64 = typeof raw.audioBase64 === 'string' ? raw.audioBase64 : typeof raw.base64 === 'string' ? raw.base64 : undefined;
  const waveformBase64 = typeof raw.waveformPreviewBase64 === 'string' ? raw.waveformPreviewBase64 : undefined;
  const status = raw.status === 'queued' ? 'queued' : raw.status === 'failed' ? 'failed' : 'completed';

  return {
    renderer: 'cloud',
    status,
    mimeType: typeof raw.mimeType === 'string' ? raw.mimeType : 'audio/mpeg',
    ...(audioBase64 ? { audioBuffer: Buffer.from(audioBase64, 'base64') } : {}),
    ...(waveformBase64 ? { waveformPreviewBuffer: Buffer.from(waveformBase64, 'base64'), waveformPreviewMimeType: 'image/svg+xml' } : {}),
    raw,
  };
}

async function renderWithBundle(manifest: AudioRenderManifest): Promise<AudioRenderResult> {
  const waveform = buildWaveformSvgBuffer(manifest);
  return {
    renderer: 'bundle',
    status: 'queued',
    mimeType: 'application/json',
    waveformPreviewBuffer: waveform,
    waveformPreviewMimeType: 'image/svg+xml',
    raw: {
      manifest,
      note: 'Saved a render bundle because no audio renderer was available.',
    },
    notes: 'Bundle saved until a renderer worker becomes available.',
  };
}

export async function renderAudioAsset(manifest: AudioRenderManifest, audioInput?: Buffer): Promise<AudioRenderResult> {
  const mode = resolveRendererMode();

  if (mode === 'bundle') {
    return renderWithBundle(manifest);
  }

  if (mode === 'ffmpeg') {
    const local = await renderWithFfmpeg(manifest, audioInput);
    if (local.status !== 'failed') return local;
    if (hasCloudRenderer()) return renderWithCloud(manifest, audioInput);
    return renderWithBundle(manifest);
  }

  if (mode === 'cloud') {
    if (hasCloudRenderer()) {
      return renderWithCloud(manifest, audioInput);
    }
    const local = await renderWithFfmpeg(manifest, audioInput);
    if (local.status !== 'failed') return local;
    return renderWithBundle(manifest);
  }

  const local = await renderWithFfmpeg(manifest, audioInput);
  if (local.status !== 'failed') return local;

  if (hasCloudRenderer()) {
    const cloud = await renderWithCloud(manifest, audioInput);
    if (cloud.status !== 'failed') return cloud;
  }

  return renderWithBundle(manifest);
}
