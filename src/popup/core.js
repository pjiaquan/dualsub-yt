const formatTimestamp = (ms) => {
  if (!Number.isFinite(ms) || ms <= 0) {
    return "";
  }
  try {
    return new Date(ms).toISOString();
  } catch (error) {
    return "";
  }
};

const formatSrtTime = (seconds) => {
  const safeSeconds = Number.isFinite(seconds) && seconds >= 0 ? seconds : 0;
  const totalMs = Math.round(safeSeconds * 1000);
  const milliseconds = totalMs % 1000;
  const totalSeconds = (totalMs - milliseconds) / 1000;
  const secs = totalSeconds % 60;
  const totalMinutes = (totalSeconds - secs) / 60;
  const minutes = totalMinutes % 60;
  const hours = (totalMinutes - minutes) / 60;

  return (
    `${String(hours).padStart(2, "0")}:` +
    `${String(minutes).padStart(2, "0")}:` +
    `${String(secs).padStart(2, "0")},` +
    `${String(milliseconds).padStart(3, "0")}`
  );
};

const normalizeTimedCaption = (row) => {
  if (!row || typeof row !== "object") {
    return null;
  }

  const start = Number.isFinite(row.startTime) ? Math.max(0, row.startTime) : 0;
  const rawEnd = Number.isFinite(row.endTime) ? Math.max(0, row.endTime) : start;
  const end = rawEnd > start ? rawEnd : start + 1;

  return {
    videoId: typeof row.videoId === "string" ? row.videoId : "",
    startTime: start,
    endTime: end,
    sourceText: typeof row.sourceText === "string" ? row.sourceText : "",
    translation: typeof row.translation === "string" ? row.translation : ""
  };
};

const toTxt = (records, timedCaptions = [], exportedAt = new Date()) => {
  const safeRecords = Array.isArray(records) ? records : [];
  const safeTimedCaptions = Array.isArray(timedCaptions)
    ? timedCaptions.map(normalizeTimedCaption).filter(Boolean)
    : [];

  if (safeTimedCaptions.length > 0) {
    const sorted = [...safeTimedCaptions].sort(
      (left, right) => left.startTime - right.startTime || left.endTime - right.endTime
    );
    const lines = [];
    sorted.forEach((caption, index) => {
      lines.push(String(index + 1));
      lines.push(`${formatSrtTime(caption.startTime)} --> ${formatSrtTime(caption.endTime)}`);
      const source = caption.sourceText || "";
      const translated = caption.translation || "";
      if (source) {
        lines.push(source);
      }
      if (translated && translated !== source) {
        lines.push(translated);
      }
      if (!source && translated) {
        lines.push(translated);
      }
      lines.push("");
    });
    return `${lines.join("\n").trimEnd()}\n`;
  }

  const lines = [];
  lines.push("# DualSub Translation Export");
  lines.push(`exported_at: ${exportedAt.toISOString()}`);
  lines.push(`total_records: ${safeRecords.length}`);

  safeRecords.forEach((record, index) => {
    lines.push("");
    lines.push(`## Record ${index + 1}`);
    if (record.videoId) {
      lines.push(`video_id: ${record.videoId}`);
    }
    if (record.model) {
      lines.push(`model: ${record.model}`);
    }
    if (record.sourceLang || record.targetLang) {
      lines.push(`lang: ${record.sourceLang || "?"} -> ${record.targetLang || "?"}`);
    }
    const updatedAt = formatTimestamp(record.updatedAt);
    if (updatedAt) {
      lines.push(`updated_at: ${updatedAt}`);
    }
    lines.push("[source]");
    lines.push(record.sourceText || "");
    lines.push("[translation]");
    lines.push(record.translation || "");
  });

  lines.push("");
  return lines.join("\n");
};

const mapPopupErrorMessage = (rawMessage) => {
  const message = rawMessage || "Export failed.";
  if (
    message.includes("Could not establish connection") ||
    message.includes("Receiving end does not exist")
  ) {
    return "Open a YouTube watch page first, then try again.";
  }
  return message;
};

const withCallback = (extensionApi, fn) =>
  new Promise((resolve, reject) => {
    try {
      fn((result) => {
        const maybeError = extensionApi?.runtime?.lastError;
        if (maybeError) {
          reject(new Error(maybeError.message || "Extension API error"));
          return;
        }
        resolve(result);
      });
    } catch (error) {
      reject(error);
    }
  });

const queryActiveTab = async (extensionApi) => {
  if (!extensionApi?.tabs?.query) {
    throw new Error("Tabs API unavailable.");
  }

  const queryOptions = { active: true, currentWindow: true };
  if (extensionApi.tabs.query.length >= 2) {
    const tabs = await withCallback(extensionApi, (done) =>
      extensionApi.tabs.query(queryOptions, done)
    );
    return Array.isArray(tabs) ? tabs[0] : null;
  }

  const queryResult = extensionApi.tabs.query(queryOptions);
  if (queryResult && typeof queryResult.then === "function") {
    const tabs = await queryResult;
    return Array.isArray(tabs) ? tabs[0] : null;
  }

  const tabs = await withCallback(extensionApi, (done) =>
    extensionApi.tabs.query(queryOptions, done)
  );
  return Array.isArray(tabs) ? tabs[0] : null;
};

const sendMessageToTab = async (extensionApi, tabId, message) => {
  if (!extensionApi?.tabs?.sendMessage) {
    throw new Error("tabs.sendMessage unavailable.");
  }

  if (extensionApi.tabs.sendMessage.length >= 3) {
    return withCallback(extensionApi, (done) =>
      extensionApi.tabs.sendMessage(tabId, message, done)
    );
  }

  const result = extensionApi.tabs.sendMessage(tabId, message);
  if (result && typeof result.then === "function") {
    return result;
  }

  return withCallback(extensionApi, (done) =>
    extensionApi.tabs.sendMessage(tabId, message, done)
  );
};

const isYoutubeWatchTab = (tab) => {
  const url = typeof tab?.url === "string" ? tab.url : "";
  return /^https:\/\/www\.youtube\.com\/watch(?:[?#]|$)/.test(url);
};

const getCurrentVideoTranslationState = async ({ extensionApi }) => {
  const activeTab = await queryActiveTab(extensionApi);
  if (!activeTab || !Number.isInteger(activeTab.id)) {
    throw new Error("No active tab found.");
  }
  if (!isYoutubeWatchTab(activeTab)) {
    throw new Error("Open a YouTube watch page first, then try again.");
  }

  const response = await sendMessageToTab(extensionApi, activeTab.id, {
    type: "dualsub_get_video_translate_state"
  });

  if (!response || response.ok !== true) {
    throw new Error(response?.error || "Could not read translation state from this tab.");
  }

  return {
    videoId: typeof response.videoId === "string" ? response.videoId : "",
    enabled: response.enabled !== false
  };
};

const setCurrentVideoTranslationState = async ({ extensionApi, enabled }) => {
  const activeTab = await queryActiveTab(extensionApi);
  if (!activeTab || !Number.isInteger(activeTab.id)) {
    throw new Error("No active tab found.");
  }
  if (!isYoutubeWatchTab(activeTab)) {
    throw new Error("Open a YouTube watch page first, then try again.");
  }

  const response = await sendMessageToTab(extensionApi, activeTab.id, {
    type: "dualsub_set_video_translate_state",
    enabled: enabled !== false
  });

  if (!response || response.ok !== true) {
    throw new Error(response?.error || "Could not update translation state for this tab.");
  }

  return {
    videoId: typeof response.videoId === "string" ? response.videoId : "",
    enabled: response.enabled !== false
  };
};

const exportTranslationsFromActiveTab = async ({
  extensionApi,
  now = () => Date.now(),
  downloadTextFile
}) => {
  if (typeof downloadTextFile !== "function") {
    throw new Error("downloadTextFile handler is required.");
  }

  const activeTab = await queryActiveTab(extensionApi);
  if (!activeTab || !Number.isInteger(activeTab.id)) {
    throw new Error("No active tab found.");
  }

  const response = await sendMessageToTab(extensionApi, activeTab.id, {
    type: "dualsub_export_translations"
  });

  if (!response || response.ok !== true) {
    throw new Error(response?.error || "Could not read translations from this tab.");
  }

  const records = Array.isArray(response.records) ? response.records : [];
  const timedCaptions = Array.isArray(response.timedCaptions)
    ? response.timedCaptions.map(normalizeTimedCaption).filter(Boolean)
    : [];
  if (records.length === 0 && timedCaptions.length === 0) {
    throw new Error("No cached translations or timed subtitles found yet.");
  }

  const timestamp = now();
  const txt = toTxt(records, timedCaptions, new Date(timestamp));
  const filename = `dualsub-translations-${timestamp}.txt`;
  downloadTextFile(filename, txt);
  return {
    count: timedCaptions.length || records.length,
    filename
  };
};

export {
  formatTimestamp,
  formatSrtTime,
  toTxt,
  mapPopupErrorMessage,
  withCallback,
  queryActiveTab,
  sendMessageToTab,
  isYoutubeWatchTab,
  getCurrentVideoTranslationState,
  setCurrentVideoTranslationState,
  exportTranslationsFromActiveTab
};
