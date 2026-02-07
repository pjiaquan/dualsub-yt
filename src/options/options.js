import { loadSettings, saveSettings } from "../shared/storage.js";

const form = document.getElementById("settings-form");
const status = document.getElementById("status");
const providerSelect = document.getElementById("translationProvider");
const aiSettings = document.getElementById("ai-settings");

const setStatus = (message) => {
  if (!status) {
    return;
  }
  status.textContent = message;
};

const applySettingsToForm = (settings) => {
  if (!form || !settings) {
    return;
  }
  form.primaryLang.value = settings.primaryLang;
  form.secondaryLang.value = settings.secondaryLang;
  form.subtitleDisplayMode.value = settings.subtitleDisplayMode;
  form.translationProvider.value = settings.translationProvider;
  form.aiModel.value = settings.aiModel;
  form.aiApiKey.value = settings.aiApiKey || "";
  form.aiSourceLang.value = settings.aiSourceLang;
  form.aiTargetLang.value = settings.aiTargetLang;
  form.aiMinChars.value = settings.aiMinChars;
  form.pocketBaseUrl.value = settings.pocketBaseUrl || "";
  form.pocketBaseCollection.value = settings.pocketBaseCollection || "";
  form.pocketBaseToken.value = settings.pocketBaseToken || "";
  form.fontSize.value = settings.fontSize;
  form.lineSpacing.value = settings.lineSpacing;
  form.opacity.value = settings.opacity;
  form.position.value = settings.position;
  form.topOffsetPx.value = settings.topOffsetPx;
  form.bottomOffsetPx.value = settings.bottomOffsetPx;
};

const readFormValues = () => {
  if (!form) {
    return null;
  }

  return {
    primaryLang: form.primaryLang.value,
    secondaryLang: form.secondaryLang.value,
    subtitleDisplayMode: form.subtitleDisplayMode.value,
    translationProvider: form.translationProvider.value,
    aiModel: form.aiModel.value,
    aiApiKey: form.aiApiKey.value,
    aiSourceLang: form.aiSourceLang.value,
    aiTargetLang: form.aiTargetLang.value,
    aiMinChars: Number.parseInt(form.aiMinChars.value, 10),
    pocketBaseUrl: form.pocketBaseUrl.value,
    pocketBaseCollection: form.pocketBaseCollection.value,
    pocketBaseToken: form.pocketBaseToken.value,
    fontSize: Number.parseFloat(form.fontSize.value),
    lineSpacing: Number.parseFloat(form.lineSpacing.value),
    opacity: Number.parseFloat(form.opacity.value),
    position: form.position.value,
    topOffsetPx: Number.parseInt(form.topOffsetPx.value, 10),
    bottomOffsetPx: Number.parseInt(form.bottomOffsetPx.value, 10)
  };
};

const syncProviderUi = () => {
  if (!providerSelect || !aiSettings) {
    return;
  }
  aiSettings.style.display = providerSelect.value === "gemini" ? "grid" : "none";
};

const init = async () => {
  if (!form) {
    return;
  }

  const settings = await loadSettings();
  applySettingsToForm(settings);
  syncProviderUi();
  if (providerSelect) {
    providerSelect.addEventListener("change", syncProviderUi);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("Saving...");
    await saveSettings(readFormValues());
    setStatus("Saved");
  });
};

init();
