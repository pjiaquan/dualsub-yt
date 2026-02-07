import { sanitizeSettings } from "../src/shared/storage.js";
import { DEFAULT_SETTINGS } from "../src/shared/config.js";

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const run = () => {
  const safe = sanitizeSettings();
  assert(safe.fontSize === DEFAULT_SETTINGS.fontSize, "default font size missing");
  assert(safe.position === DEFAULT_SETTINGS.position, "default position missing");
  assert(safe.translationProvider === DEFAULT_SETTINGS.translationProvider, "default translation provider missing");
  assert(safe.subtitleDisplayMode === DEFAULT_SETTINGS.subtitleDisplayMode, "default display mode missing");

  const sanitized = sanitizeSettings({
    fontSize: 8,
    lineSpacing: 3,
    opacity: 1.2,
    position: "side",
    primaryLang: "  en ",
    secondaryLang: " zh-Hant ",
    subtitleDisplayMode: "translated-only",
    topOffsetPx: 999,
    bottomOffsetPx: 64.4,
    translationProvider: "gemini",
    aiModel: "  gemini-2.0-flash ",
    aiApiKey: "  test-key  ",
    aiSourceLang: " auto ",
    aiTargetLang: " zh-Hant ",
    aiMinChars: 500,
    pocketBaseUrl: " https://pb.example.com/ ",
    pocketBaseCollection: "  translation_cache ",
    pocketBaseToken: "  abc123  "
  });

  assert(sanitized.fontSize === DEFAULT_SETTINGS.fontSize, "font size not sanitized");
  assert(sanitized.lineSpacing === DEFAULT_SETTINGS.lineSpacing, "line spacing not sanitized");
  assert(sanitized.opacity === DEFAULT_SETTINGS.opacity, "opacity not sanitized");
  assert(sanitized.position === DEFAULT_SETTINGS.position, "position not sanitized");
  assert(sanitized.primaryLang === "en", "primary language trim failed");
  assert(sanitized.secondaryLang === "zh-Hant", "secondary language trim failed");
  assert(sanitized.subtitleDisplayMode === "translated-only", "display mode not sanitized");
  assert(sanitized.topOffsetPx === DEFAULT_SETTINGS.topOffsetPx, "top offset should clamp to default");
  assert(sanitized.bottomOffsetPx === 64, "bottom offset should round to integer");
  assert(sanitized.translationProvider === "gemini", "translation provider not sanitized");
  assert(sanitized.aiModel === "gemini-2.0-flash", "ai model trim failed");
  assert(sanitized.aiApiKey === "test-key", "ai api key trim failed");
  assert(sanitized.aiSourceLang === "auto", "ai source language trim failed");
  assert(sanitized.aiTargetLang === "zh-Hant", "ai target language trim failed");
  assert(sanitized.aiMinChars === DEFAULT_SETTINGS.aiMinChars, "aiMinChars should clamp to default");
  assert(sanitized.pocketBaseUrl === "https://pb.example.com", "PocketBase URL trim failed");
  assert(sanitized.pocketBaseCollection === "translation_cache", "PocketBase collection trim failed");
  assert(sanitized.pocketBaseToken === "abc123", "PocketBase token trim failed");
};

export { run };
