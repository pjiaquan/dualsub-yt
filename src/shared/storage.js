import { DEFAULT_SETTINGS, STORAGE_KEY } from "./config.js";

const sanitizeSettings = (input) => {
  const safe = {
    ...DEFAULT_SETTINGS
  };

  if (!input || typeof input !== "object") {
    return safe;
  }

  if (typeof input.fontSize === "number" && input.fontSize >= 12 && input.fontSize <= 64) {
    safe.fontSize = input.fontSize;
  }

  if (typeof input.lineSpacing === "number" && input.lineSpacing >= 1 && input.lineSpacing <= 2) {
    safe.lineSpacing = input.lineSpacing;
  }

  if (typeof input.opacity === "number" && input.opacity >= 0.2 && input.opacity <= 1) {
    safe.opacity = input.opacity;
  }

  if (input.position === "top" || input.position === "bottom") {
    safe.position = input.position;
  }

  if (typeof input.primaryLang === "string" && input.primaryLang.trim()) {
    safe.primaryLang = input.primaryLang.trim();
  }

  if (typeof input.secondaryLang === "string" && input.secondaryLang.trim()) {
    safe.secondaryLang = input.secondaryLang.trim();
  }

  if (input.subtitleDisplayMode === "both" || input.subtitleDisplayMode === "translated-only") {
    safe.subtitleDisplayMode = input.subtitleDisplayMode;
  }

  if (typeof input.topOffsetPx === "number" && input.topOffsetPx >= 0 && input.topOffsetPx <= 600) {
    safe.topOffsetPx = Math.round(input.topOffsetPx);
  }

  if (typeof input.bottomOffsetPx === "number" && input.bottomOffsetPx >= 0 && input.bottomOffsetPx <= 600) {
    safe.bottomOffsetPx = Math.round(input.bottomOffsetPx);
  }

  if (input.translationProvider === "youtube" || input.translationProvider === "gemini") {
    safe.translationProvider = input.translationProvider;
  }

  if (typeof input.aiModel === "string" && input.aiModel.trim()) {
    safe.aiModel = input.aiModel.trim();
  }

  if (typeof input.aiApiKey === "string") {
    safe.aiApiKey = input.aiApiKey.trim();
  }

  if (typeof input.aiSourceLang === "string" && input.aiSourceLang.trim()) {
    safe.aiSourceLang = input.aiSourceLang.trim();
  }

  if (typeof input.aiTargetLang === "string" && input.aiTargetLang.trim()) {
    safe.aiTargetLang = input.aiTargetLang.trim();
  }

  if (typeof input.aiMinChars === "number" && input.aiMinChars >= 1 && input.aiMinChars <= 200) {
    safe.aiMinChars = Math.round(input.aiMinChars);
  }

  if (typeof input.pocketBaseUrl === "string") {
    safe.pocketBaseUrl = input.pocketBaseUrl.trim().replace(/\/+$/, "");
  }

  if (typeof input.pocketBaseCollection === "string" && input.pocketBaseCollection.trim()) {
    safe.pocketBaseCollection = input.pocketBaseCollection.trim();
  }

  if (typeof input.pocketBaseAuthCollection === "string" && input.pocketBaseAuthCollection.trim()) {
    safe.pocketBaseAuthCollection = input.pocketBaseAuthCollection.trim();
  }

  if (typeof input.pocketBaseEmail === "string") {
    safe.pocketBaseEmail = input.pocketBaseEmail.trim();
  }

  if (typeof input.pocketBaseToken === "string") {
    safe.pocketBaseToken = input.pocketBaseToken.trim();
  }

  if (typeof input.pocketBaseUserId === "string") {
    safe.pocketBaseUserId = input.pocketBaseUserId.trim();
  }

  return safe;
};

const loadSettings = async () => {
  if (!globalThis.browser || !browser.storage || !browser.storage.local) {
    return sanitizeSettings(DEFAULT_SETTINGS);
  }

  const result = await browser.storage.local.get(STORAGE_KEY);
  return sanitizeSettings(result ? result[STORAGE_KEY] : null);
};

const saveSettings = async (settings) => {
  if (!globalThis.browser || !browser.storage || !browser.storage.local) {
    return;
  }

  const safe = sanitizeSettings(settings);
  await browser.storage.local.set({
    [STORAGE_KEY]: safe
  });
};

export { loadSettings, saveSettings, sanitizeSettings, STORAGE_KEY };
