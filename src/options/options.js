import { loadSettings, saveSettings } from "../shared/storage.js";

const form = document.getElementById("settings-form");
const status = document.getElementById("status");

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
  form.fontSize.value = settings.fontSize;
  form.lineSpacing.value = settings.lineSpacing;
  form.opacity.value = settings.opacity;
  form.position.value = settings.position;
};

const readFormValues = () => {
  if (!form) {
    return null;
  }

  return {
    fontSize: Number.parseFloat(form.fontSize.value),
    lineSpacing: Number.parseFloat(form.lineSpacing.value),
    opacity: Number.parseFloat(form.opacity.value),
    position: form.position.value
  };
};

const init = async () => {
  if (!form) {
    return;
  }

  const settings = await loadSettings();
  applySettingsToForm(settings);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("Saving...");
    await saveSettings(readFormValues());
    setStatus("Saved");
  });
};

init();
