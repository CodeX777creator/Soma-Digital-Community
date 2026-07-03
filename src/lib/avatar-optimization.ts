/**
 * Avatar Image Optimization Utilities
 * 
 * Handles image compression, resizing, and format optimization for user avatars
 * to improve loading performance and reduce storage costs.
 */

import { logger } from './logger';

export interface AvatarOptimizationOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
  maxSizeMB?: number;
}

const DEFAULT_AVATAR_SIZE = 256; // Dimensions for avatars
const MAX_AVATAR_SIZE = 512;
const DEFAULT_QUALITY = 0.8;
const MAX_FILE_SIZE_MB = 2;

/**
 * Validates if a file is a valid image for avatar upload
 */
export function isValidAvatarImage(file: File): boolean {
  if (!file) return false;
  
  const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!validTypes.includes(file.type)) {
    return false;
  }
  
  const sizeInMB = file.size / (1024 * 1024);
  if (sizeInMB > MAX_FILE_SIZE_MB) {
    logger.warn(`Avatar file too large: ${sizeInMB.toFixed(2)}MB (max: ${MAX_FILE_SIZE_MB}MB)`);
    return false;
  }
  
  return true;
}

/**
 * Compresses and resizes an image file using a canvas
 * Returns a Promise<File> with the optimized image
 */
export async function optimizeAvatarImage(
  file: File,
  options: AvatarOptimizationOptions = {}
): Promise<File> {
  const {
    maxWidth = DEFAULT_AVATAR_SIZE,
    maxHeight = DEFAULT_AVATAR_SIZE,
    quality = DEFAULT_QUALITY,
    format = 'webp',
  } = options;

  return new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();
      
      reader.onload = (event) => {
        const img = new Image();
        
        img.onload = () => {
          // Calculate new dimensions while maintaining aspect ratio
          let width = img.width;
          let height = img.height;
          
          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }
          
          // Create canvas and draw resized image
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }
          
          // Draw image with smooth scaling
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);
          
          // Convert to optimized format
          const mimeType = format === 'jpeg' ? 'image/jpeg' : 
                          format === 'png' ? 'image/png' : 'image/webp';
          
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Failed to create optimized image'));
                return;
              }
              
              // Create new filename with optimized extension
              const originalExtension = file.name.split('.').pop() || '';
              const newExtension = format === 'jpeg' ? 'jpg' : format;
              const dotIndex = file.name.lastIndexOf('.');
              const newFileName = dotIndex > 0 
                ? file.name.substring(0, dotIndex) + '.' + newExtension
                : file.name + '.' + newExtension;
              
              const optimizedFile = new File([blob], newFileName, {
                type: mimeType,
                lastModified: Date.now(),
              });
              
              logger.info('Avatar optimized', {
                originalSize: (file.size / 1024).toFixed(2) + 'KB',
                optimizedSize: (optimizedFile.size / 1024).toFixed(2) + 'KB',
                reduction: `${Math.round((1 - optimizedFile.size / file.size) * 100)}%`,
                dimensions: `${width}x${height}`,
                format: newExtension,
              });
              
              resolve(optimizedFile);
            },
            mimeType,
            quality
          );
        };
        
        img.onerror = () => {
          reject(new Error('Failed to load image for optimization'));
        };
        
        if (event.target?.result) {
          img.src = event.target.result as string;
        } else {
          reject(new Error('No image data received'));
        }
      };
      
      reader.onerror = () => {
        reject(new Error('Failed to read image file'));
      };
      
      reader.readAsDataURL(file);
    } catch (error) {
      logger.error('Error optimizing avatar', error instanceof Error ? error : undefined);
      reject(error);
    }
  });
}

/**
 * Compression fallback for very old browsers that don't support canvas
 * Just returns the original file with a warning
 */
export async function fallbackOptimizeAvatar(file: File): Promise<File> {
  logger.warn('Browser does not support image optimization, using original file');
  return file;
}

/**
 * Main entry point for avatar optimization with browser support detection
 */
export async function processAvatarForUpload(
  file: File,
  options: AvatarOptimizationOptions = {}
): Promise<File> {
  // Validate the file first
  if (!isValidAvatarImage(file)) {
    throw new Error('Invalid avatar file. Max 2MB. Supported formats: JPEG, PNG, GIF, WebP');
  }
  
  // Check if canvas is supported (modern browsers)
  if (typeof document !== 'undefined' && 'HTMLCanvasElement' in window) {
    try {
      return await optimizeAvatarImage(file, options);
    } catch (error) {
      logger.error('Optimization failed, falling back to original', error instanceof Error ? error : undefined);
      return file;
    }
  } else {
    // Older browsers without canvas support
    return fallbackOptimizeAvatar(file);
  }
}

/**
 * Generate avatar placeholder from user name (for when no image is available)
 */
export function generateAvatarPlaceholder(name: string, size: number = 256): string {
  if (!name) return '';
  
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  
  if (!ctx) return '';
  
  // Generate colors based on name
  const colors = [
    { bg: '#6366f1', text: '#ffffff' }, // Indigo
    { bg: '#8b5cf6', text: '#ffffff' }, // Violet
    { bg: '#ec4899', text: '#ffffff' }, // Pink
    { bg: '#14b8a6', text: '#ffffff' }, // Teal
  ];
  
  const nameHash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const colorIndex = nameHash % colors.length;
  const color = colors[colorIndex];
  
  // Draw background
  ctx.fillStyle = color.bg;
  ctx.fillRect(0, 0, size, size);
  
  // Add subtle gradient
  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2
  );
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0.1)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  
  // Draw initials
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);
  
  ctx.font = `bold ${size * 0.4}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color.text;
  ctx.fillText(initials, size / 2, size / 2);
  
  return canvas.toDataURL('image/png');
}

export interface AvatarOptimizationResult {
  file: File;
  size: number;
  dimensions: { width: number; height: number };
  format: string;
  url: string;
}

/**
 * Processes an avatar file and returns both the optimized file and its data URL preview
 */
export async function optimizeAndGetAvatarPreview(
  file: File,
  options: AvatarOptimizationOptions = {}
): Promise<AvatarOptimizationResult> {
  const optimizedFile = await processAvatarForUpload(file, options);
  
  // Create preview URL
  const url = URL.createObjectURL(optimizedFile);
  
  // Get dimensions from the file
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        file: optimizedFile,
        size: optimizedFile.size,
        dimensions: { width: img.width, height: img.height },
        format: optimizedFile.type.split('/')[1] || 'png',
        url,
      });
    };
    img.onerror = () => {
      // Fallback if image can't be loaded
      resolve({
        file: optimizedFile,
        size: optimizedFile.size,
        dimensions: { width: 256, height: 256 },
        format: optimizedFile.type.split('/')[1] || 'png',
        url,
      });
    };
    img.src = url;
  });
}