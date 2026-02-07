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

  const sanitized = sanitizeSettings({
    fontSize: 8,
    lineSpacing: 3,
    opacity: 1.2,
    position: "side",
    primaryLang: "  en ",
    secondaryLang: " zh-Hant "
  });

  assert(sanitized.fontSize === DEFAULT_SETTINGS.fontSize, "font size not sanitized");
  assert(sanitized.lineSpacing === DEFAULT_SETTINGS.lineSpacing, "line spacing not sanitized");
  assert(sanitized.opacity === DEFAULT_SETTINGS.opacity, "opacity not sanitized");
  assert(sanitized.position === DEFAULT_SETTINGS.position, "position not sanitized");
  assert(sanitized.primaryLang === "en", "primary language trim failed");
  assert(sanitized.secondaryLang === "zh-Hant", "secondary language trim failed");
};

export { run };
