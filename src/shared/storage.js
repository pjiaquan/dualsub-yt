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

export { loadSettings, saveSettings, sanitizeSettings };
