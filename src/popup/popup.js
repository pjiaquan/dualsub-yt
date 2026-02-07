import {
  exportTranslationsFromActiveTab,
  getCurrentVideoTranslationState,
  mapPopupErrorMessage,
  setCurrentVideoTranslationState
} from "./core.js";

const extensionApi = globalThis.browser || globalThis.chrome;

const downloadButton = typeof document !== "undefined"
  ? document.getElementById("downloadBtn")
  : null;
const exportStatusEl = typeof document !== "undefined"
  ? document.getElementById("exportStatus")
  : null;
const translateToggleEl = typeof document !== "undefined"
  ? document.getElementById("translateToggle")
  : null;
const toggleStatusEl = typeof document !== "undefined"
  ? document.getElementById("toggleStatus")
  : null;

const setStatus = (element, message, isError = false) => {
  if (!element) {
    return;
  }
  element.textContent = message || "";
  element.classList.toggle("error", Boolean(isError));
};

const downloadTextFile = (filename, content) => {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
};

const runExport = async () => {
  if (!downloadButton) {
    return;
  }

  setStatus(exportStatusEl, "Collecting translations...");
  downloadButton.disabled = true;

  try {
    const result = await exportTranslationsFromActiveTab({
      extensionApi,
      downloadTextFile
    });
    setStatus(exportStatusEl, `Downloaded ${result.count} records.`);
  } catch (error) {
    const rawMessage = error && error.message ? error.message : "Export failed.";
    setStatus(exportStatusEl, mapPopupErrorMessage(rawMessage), true);
  } finally {
    downloadButton.disabled = false;
  }
};

const initVideoToggle = async () => {
  if (!translateToggleEl) {
    return;
  }

  translateToggleEl.disabled = true;
  setStatus(toggleStatusEl, "Loading current video state...");

  try {
    const state = await getCurrentVideoTranslationState({ extensionApi });
    translateToggleEl.checked = state.enabled;
    translateToggleEl.disabled = false;
    setStatus(toggleStatusEl, state.enabled ? "Translation is enabled for this video." : "Translation is paused for this video.");
  } catch (error) {
    const rawMessage = error && error.message ? error.message : "Could not load video translation state.";
    setStatus(toggleStatusEl, mapPopupErrorMessage(rawMessage), true);
    translateToggleEl.checked = true;
    translateToggleEl.disabled = true;
  }
};

const runToggleUpdate = async () => {
  if (!translateToggleEl) {
    return;
  }

  const requested = translateToggleEl.checked;
  translateToggleEl.disabled = true;
  setStatus(toggleStatusEl, requested ? "Enabling translation..." : "Pausing translation...");

  try {
    const state = await setCurrentVideoTranslationState({
      extensionApi,
      enabled: requested
    });
    translateToggleEl.checked = state.enabled;
    setStatus(toggleStatusEl, state.enabled ? "Translation is enabled for this video." : "Translation is paused for this video.");
  } catch (error) {
    translateToggleEl.checked = !requested;
    const rawMessage = error && error.message ? error.message : "Could not update video translation state.";
    setStatus(toggleStatusEl, mapPopupErrorMessage(rawMessage), true);
  } finally {
    translateToggleEl.disabled = false;
  }
};

if (downloadButton) {
  downloadButton.addEventListener("click", () => {
    runExport();
  });
}

if (translateToggleEl) {
  translateToggleEl.addEventListener("change", () => {
    runToggleUpdate();
  });
}

initVideoToggle();

export { runExport };
