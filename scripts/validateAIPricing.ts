import assert from "node:assert/strict";
import {
  CREATOR_CREDIT_RETAIL_VALUE_USD,
  estimateAudioCredits,
  estimateImageCredits,
  estimateTextCredits,
  estimateVideoCredits,
} from "../src/services/ai-platform/pricing";

const standardModel = {
  id: "meta/llama-3.1-8b",
  name: "Standard text",
  provider: "meta",
  type: "language",
  tags: [],
  pricing: {},
  active: true,
  lastSyncedAt: null,
  sdcEnabled: true,
  tierAccess: ["explorer", "pro", "elite", "enterprise"],
  creditClass: "standard",
  creditMultiplier: 1,
  recommendedFor: ["chat"],
};

const premiumImageModel = {
  ...standardModel,
  id: "bytedance/seedream-5.0-pro",
  name: "Premium image",
  provider: "bytedance",
  type: "image",
  tags: ["image-generation"],
  creditClass: "premium",
  creditMultiplier: 1.5,
};

assert.equal(CREATOR_CREDIT_RETAIL_VALUE_USD, 0.2, "1 Creator Credit should equal $0.20 retail baseline");

const textQuote = estimateTextCredits({
  feature: "chat",
  modality: "text",
  model: standardModel as any,
  prompt: "Create a useful caption for small business owners.",
  maxOutputTokens: 1000,
});
assert.ok(textQuote.credits >= 1, "Text should reserve at least one credit");
assert.equal(textQuote.pricingUnit, "token");

const imageQuote = estimateImageCredits({
  feature: "image_generation",
  modality: "image",
  model: standardModel as any,
  imageCount: 2,
});
assert.equal(imageQuote.credits, 20, "Standard image pricing should charge per image");

const premiumImageQuote = estimateImageCredits({
  feature: "image_generation",
  modality: "image",
  model: premiumImageModel as any,
  imageCount: 1,
});
assert.ok(premiumImageQuote.credits >= 20, "Premium image models should cost at least premium image baseline");

const draftQuote = estimateVideoCredits({
  feature: "video_generation",
  modality: "video",
  generationMode: "draft",
});
assert.equal(draftQuote.credits, 20, "Video draft should not charge full render pricing");
assert.equal(draftQuote.pricingUnit, "flat");

const renderQuote = estimateVideoCredits({
  feature: "video_generation",
  modality: "video",
  durationSeconds: 30,
  generationMode: "render",
});
assert.equal(renderQuote.credits, 300, "Video render should charge per second");
assert.equal(renderQuote.pricingUnit, "second");

const audioQuote = estimateAudioCredits({
  feature: "audio_generation",
  modality: "audio",
  durationSeconds: 30,
  characters: 420,
});
assert.equal(audioQuote.credits, 60, "Audio should charge by seconds with character safety");
assert.equal(audioQuote.pricingUnit, "second");

console.log("AI pricing validation passed.");
