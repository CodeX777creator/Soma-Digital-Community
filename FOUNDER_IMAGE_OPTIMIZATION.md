# Founder Portrait Image Optimization Guide

## Problem
The founder portrait at `public/images/founder_portrait.png` is:
- Loaded with a standard `<img>` tag (no optimization)
- Fixed at 600px height (may cause layout shift)
- Likely a large PNG file (slow loading)
- No lazy loading (blocks initial page render)

## Solutions (Apply in Order)

---

## Solution 1: Use OptimizedImage Component (QUICK FIX)

Replace the current image in `src/app/page.tsx`:

```tsx
// OLD CODE (around line 180)
<img
  src="/founder_portrait.png"
  alt="Founder of Soma Digital"
  className="rounded-[3rem] w-full h-[600px] object-cover border border-white/10 shadow-2xl relative z-10"
/>

// NEW CODE
import { OptimizedImage } from "@/components/ui/optimized-image";

<OptimizedImage
  src="/images/founder_portrait.png"
  alt="Founder of Soma Digital"
  containerClassName="rounded-[3rem] w-full h-[600px] border border-white/10 shadow-2xl relative z-10"
  className="w-full h-full object-cover"
/>
```

**Benefits:**
- Lazy loading (loads when scrolled into view)
- Loading skeleton while image loads
- Error handling with retry logic
- Smooth fade-in animation

---

## Solution 2: Convert PNG to WebP (BETTER COMPRESSION)

### Option A: Use Online Converter
1. Go to https://squoosh.app/ or https://convertio.co/png-webp/
2. Upload `founder_portrait.png`
3. Convert to WebP format
4. Save as `founder_portrait.webp` in `public/images/`
5. Update the reference:

```tsx
<OptimizedImage
  src="/images/founder_portrait.webp"
  alt="Founder of Soma Digital"
  containerClassName="rounded-[3rem] w-full h-[600px] border border-white/10 shadow-2xl relative z-10"
  className="w-full h-full object-cover"
/>
```

### Option B: Use Sharp (Recommended for Production)
```bash
npm install sharp
```

Create a script `scripts/optimize-images.js`:
```javascript
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const inputDir = './public/images';
const files = fs.readdirSync(inputDir);

files.forEach(file => {
  if (file.endsWith('.png') || file.endsWith('.jpg')) {
    const inputPath = path.join(inputDir, file);
    const outputPath = path.join(inputDir, file.replace(/\.[^.]+$/, '.webp'));
    
    sharp(inputPath)
      .webp({ quality: 85, effort: 6 })
      .resize(1200, null, { withoutEnlargement: true }) // Max width 1200px
      .toFile(outputPath)
      .then(() => console.log(`Optimized: ${file} -> ${path.basename(outputPath)}`))
      .catch(err => console.error(`Failed: ${file}`, err));
  }
});
```

Run: `node scripts/optimize-images.js`

**Benefits:**
- WebP is 25-35% smaller than PNG
- Faster loading
- Better quality at smaller sizes

---

## Solution 3: Responsive Images (MULTIPLE SIZES)

Create multiple sizes for different screen widths:

```tsx
<picture>
  <source
    media="(max-width: 640px)"
    srcSet="/images/founder_portrait_640w.webp"
  />
  <source
    media="(max-width: 1024px)"
    srcSet="/images/founder_portrait_1024w.webp"
  />
  <source
    srcSet="/images/founder_portrait_1200w.webp"
  />
  <OptimizedImage
    src="/images/founder_portrait_1200w.webp"
    alt="Founder of Soma Digital"
    containerClassName="rounded-[3rem] w-full h-[600px] border border-white/10 shadow-2xl relative z-10"
    className="w-full h-full object-cover"
  />
</picture>
```

Generate sizes with Sharp:
```javascript
const sizes = [640, 1024, 1200];

sizes.forEach(width => {
  sharp('public/images/founder_portrait.png')
    .webp({ quality: 85 })
    .resize(width, null, { withoutEnlargement: true })
    .toFile(`public/images/founder_portrait_${width}w.webp`);
});
```

---

## Solution 4: Blur Placeholder (BETTER UX)

Generate a tiny blur placeholder:

```javascript
// scripts/generate-blur.js
const sharp = require('sharp');

sharp('public/images/founder_portrait.png')
  .resize(20, null)
  .blur()
  .toBuffer()
  .then(buffer => {
    const base64 = buffer.toString('base64');
    console.log(`data:image/png;base64,${base64}`);
  });
```

Use in component:
```tsx
<OptimizedImage
  src="/images/founder_portrait.webp"
  alt="Founder of Soma Digital"
  containerClassName="rounded-[3rem] w-full h-[600px] border border-white/10 shadow-2xl relative z-10"
  className="w-full h-full object-cover"
  blurDataUrl="data:image/webp;base64,UklGR..." // Your generated blur
/>
```

---

## Solution 5: Complete Implementation (RECOMMENDED)

Here's the complete optimized implementation for `src/app/page.tsx`:

```tsx
// At the top of the file, add import
import { OptimizedImage } from "@/components/ui/optimized-image";

// Replace the founder section (around line 175-190)
<section className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
  <div className="relative">
    <div className="absolute -inset-4 bg-primary/20 blur-[100px] rounded-full opacity-30" />
    
    {/* Optimized Founder Image */}
    <div className="rounded-[3rem] w-full h-[600px] border border-white/10 shadow-2xl relative z-10 overflow-hidden">
      <OptimizedImage
        src="/images/founder_portrait.webp"
        alt="Founder of Soma Digital"
        containerClassName="w-full h-full"
        className="w-full h-full object-cover object-top"
        fallbackSrc="/images/founder_portrait.png"
      />
    </div>
    
    <GlassCard className="absolute -bottom-8 -right-8 p-6 w-72 z-20 animate-float" style={{ animationDuration: '10s' }}>
      <Quote className="w-8 h-8 text-primary mb-4 opacity-50" />
      <p className="text-sm italic text-white/90 leading-relaxed mb-4">
        "We aren't here to fake success. We're here to build it, brick by brick, together."
      </p>
      <p className="font-bold text-sm">Founder, Soma Digital</p>
    </GlassCard>
  </div>
  
  {/* ... rest of the section */}
</section>
```

---

## Expected Results

| Metric | Before | After |
|--------|--------|-------|
| File Size | ~2-5 MB (PNG) | ~300-800 KB (WebP) |
| Load Time | 2-5s | 0.5-1s |
| First Paint | Blocked | Not blocked |
| Layout Shift | Possible | None |

---

## Quick Checklist

- [ ] Convert PNG to WebP format
- [ ] Use `OptimizedImage` component
- [ ] Add fallback PNG for older browsers
- [ ] Test on mobile (should load faster)
- [ ] Check Lighthouse score improvement

---

## Alternative: Use Cloudinary/Cloudflare

If you want automatic optimization without manual conversion:

```tsx
// Using Cloudinary
<img
  src="https://res.cloudinary.com/your-account/image/upload/w_1200,q_85,f_webp/v1/founder_portrait"
  alt="Founder"
  loading="lazy"
/>

// Using Cloudflare Images
<img
  src="/cdn-cgi/image/width=1200,quality=85,format=webp/images/founder_portrait.png"
  alt="Founder"
  loading="lazy"
/>
```

This automatically converts and serves the optimal format.
