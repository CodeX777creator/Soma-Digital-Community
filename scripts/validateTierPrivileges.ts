import assert from "node:assert/strict";
import { DEFAULT_TIER_PRIVILEGES, getTierPrivileges, schedulerLimitReached } from "../src/lib/tier-privileges";
import { estimateUsageCredits } from "../src/services/ai-platform/pricing";

assert.equal(getTierPrivileges("explorer").includedCreatorCredits, 0);
assert.equal(getTierPrivileges("pro").scheduler.connectedAccounts, 5);
assert.equal(getTierPrivileges("elite").scheduler.campaigns, true);
assert.deepEqual(getTierPrivileges("enterprise").aiModelClasses, DEFAULT_TIER_PRIVILEGES.elite.aiModelClasses);
assert.equal(schedulerLimitReached("explorer", 10), true);
assert.equal(schedulerLimitReached("pro", 99), false);

const translation = estimateUsageCredits({
  feature: "translation",
  modality: "text",
  prompt: "Translate this short message.",
  characters: 1000,
});
assert.equal(translation.pricingUnit, "character");

const speechToText = estimateUsageCredits({
  feature: "speech_to_text",
  modality: "audio",
  durationSeconds: 30,
});
assert.equal(speechToText.pricingUnit, "second");

console.log("Tier privilege validation passed.");
