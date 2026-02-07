import {
  exportTranslationsFromActiveTab,
  mapPopupErrorMessage
} from "./core.js";

const extensionApi = globalThis.browser || globalThis.chrome;

const downloadButton = typeof document !== "undefined"
  ? document.getElementById("downloadBtn")
  : null;
const statusEl = typeof document !== "undefined"
  ? document.getElementById("status")
  : null;

const setStatus = (message, isError = false) => {
  if (!statusEl) {
    return;
  }
  statusEl.textContent = message || "";
  statusEl.classList.toggle("error", Boolean(isError));
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

  setStatus("Collecting translations...");
  downloadButton.disabled = true;

  try {
    const result = await exportTranslationsFromActiveTab({
      extensionApi,
      downloadTextFile
    });
    setStatus(`Downloaded ${result.count} records.`);
  } catch (error) {
    const rawMessage = error && error.message ? error.message : "Export failed.";
    setStatus(mapPopupErrorMessage(rawMessage), true);
  } finally {
    downloadButton.disabled = false;
  }
};

if (downloadButton) {
  downloadButton.addEventListener("click", () => {
    runExport();
  });
}

export { runExport };
