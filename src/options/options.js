import { loadSettings, saveSettings } from "../shared/storage.js";

const form = document.getElementById("settings-form");
const status = document.getElementById("status");
const providerSelect = document.getElementById("translationProvider");
const aiSettings = document.getElementById("ai-settings");
const pocketBaseLoginButton = document.getElementById("pocketBaseLogin");
const pocketBaseLogoutButton = document.getElementById("pocketBaseLogout");
const pocketBaseAuthStatus = document.getElementById("pocketBaseAuthStatus");

const setStatus = (message) => {
  if (!status) {
    return;
  }
  status.textContent = message;
};

const setPocketBaseAuthStatus = (message, isError = false) => {
  if (!pocketBaseAuthStatus) {
    return;
  }
  pocketBaseAuthStatus.textContent = message;
  pocketBaseAuthStatus.classList.toggle("error", Boolean(isError));
};

const decodePocketBaseUserIdFromToken = (token) => {
  if (!token || typeof token !== "string") {
    return "";
  }

  const segments = token.split(".");
  if (segments.length < 2) {
    return "";
  }

  const payloadSegment = segments[1];
  const normalized = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);

  try {
    const payloadText = atob(padded);
    const payload = JSON.parse(payloadText);
    if (typeof payload?.id === "string" && payload.id.trim()) {
      return payload.id.trim();
    }
    if (typeof payload?.sub === "string" && payload.sub.trim()) {
      return payload.sub.trim();
    }
  } catch (error) {
    return "";
  }

  return "";
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
  form.pocketBaseAuthCollection.value = settings.pocketBaseAuthCollection || "users";
  form.pocketBaseEmail.value = settings.pocketBaseEmail || "";
  form.pocketBasePassword.value = "";
  form.pocketBaseToken.value = settings.pocketBaseToken || "";
  form.pocketBaseUserId.value = settings.pocketBaseUserId || "";
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
    pocketBaseAuthCollection: form.pocketBaseAuthCollection.value,
    pocketBaseEmail: form.pocketBaseEmail.value,
    pocketBaseToken: form.pocketBaseToken.value,
    pocketBaseUserId: form.pocketBaseUserId.value,
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

const setAuthButtonsDisabled = (isDisabled) => {
  if (pocketBaseLoginButton) {
    pocketBaseLoginButton.disabled = isDisabled;
  }
  if (pocketBaseLogoutButton) {
    pocketBaseLogoutButton.disabled = isDisabled;
  }
};

const readPocketBaseEndpoint = () => {
  if (!form) {
    return null;
  }

  const baseUrl = form.pocketBaseUrl.value.trim().replace(/\/+$/, "");
  const authCollection = form.pocketBaseAuthCollection.value.trim() || "users";
  if (!baseUrl) {
    throw new Error("PocketBase URL is required.");
  }

  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch (error) {
    throw new Error("PocketBase URL is invalid.");
  }

  return `${parsed.toString().replace(/\/+$/, "")}/api/collections/${encodeURIComponent(authCollection)}/auth-with-password`;
};

const updateAuthSummary = () => {
  if (!form) {
    return;
  }
  if (form.pocketBaseToken.value.trim()) {
    setPocketBaseAuthStatus("PocketBase token is saved.");
  } else {
    setPocketBaseAuthStatus("Not logged in.");
  }
};

const saveCurrentSettings = async () => {
  await saveSettings(readFormValues());
};

const loginPocketBase = async () => {
  if (!form) {
    return;
  }

  const identity = form.pocketBaseEmail.value.trim();
  const password = form.pocketBasePassword.value;
  if (!identity || !password) {
    setPocketBaseAuthStatus("Email/identity and password are required.", true);
    return;
  }

  let endpoint;
  try {
    endpoint = readPocketBaseEndpoint();
  } catch (error) {
    setPocketBaseAuthStatus(error instanceof Error ? error.message : "Invalid PocketBase settings.", true);
    return;
  }

  try {
    setAuthButtonsDisabled(true);
    setPocketBaseAuthStatus("Logging in...");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ identity, password })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data || typeof data.token !== "string" || !data.token.trim()) {
      const errorMessage =
        typeof data?.message === "string" && data.message.trim()
          ? data.message.trim()
          : `Login failed (${response.status}).`;
      throw new Error(errorMessage);
    }

    form.pocketBaseToken.value = data.token.trim();
    form.pocketBaseUserId.value =
      (typeof data?.record?.id === "string" && data.record.id.trim()) ||
      decodePocketBaseUserIdFromToken(data.token) ||
      "";
    form.pocketBasePassword.value = "";
    await saveCurrentSettings();
    setStatus("Saved");
    setPocketBaseAuthStatus("Login successful. Token saved.");
  } catch (error) {
    setPocketBaseAuthStatus(error instanceof Error ? error.message : "PocketBase login failed.", true);
  } finally {
    setAuthButtonsDisabled(false);
  }
};

const logoutPocketBase = async () => {
  if (!form) {
    return;
  }

  form.pocketBaseToken.value = "";
  form.pocketBaseUserId.value = "";
  form.pocketBasePassword.value = "";
  await saveCurrentSettings();
  setStatus("Saved");
  setPocketBaseAuthStatus("Logged out. Token cleared.");
};

const init = async () => {
  if (!form) {
    return;
  }

  const settings = await loadSettings();
  applySettingsToForm(settings);
  syncProviderUi();
  updateAuthSummary();
  if (providerSelect) {
    providerSelect.addEventListener("change", syncProviderUi);
  }
  if (pocketBaseLoginButton) {
    pocketBaseLoginButton.addEventListener("click", () => {
      loginPocketBase();
    });
  }
  if (pocketBaseLogoutButton) {
    pocketBaseLogoutButton.addEventListener("click", () => {
      logoutPocketBase();
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("Saving...");
    await saveCurrentSettings();
    setStatus("Saved");
    updateAuthSummary();
  });
};

init();
