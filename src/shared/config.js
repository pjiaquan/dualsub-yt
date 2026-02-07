export const STORAGE_KEY = "dualsub_settings";

export const DEFAULT_SETTINGS = Object.freeze({
  primaryLang: "en",
  secondaryLang: "zh-Hant",
  subtitleDisplayMode: "both",
  topOffsetPx: 72,
  bottomOffsetPx: 72,
  translationProvider: "youtube",
  aiModel: "gemini-2.0-flash",
  aiApiKey: "",
  aiSourceLang: "en",
  aiTargetLang: "zh-Hant",
  aiMinChars: 12,
  pocketBaseUrl: "",
  pocketBaseCollection: "translations",
  pocketBaseToken: "",
  fontSize: 24,
  lineSpacing: 1.1,
  position: "bottom",
  opacity: 0.9
});
