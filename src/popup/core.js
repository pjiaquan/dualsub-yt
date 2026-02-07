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

const toTxt = (records, exportedAt = new Date()) => {
  const lines = [];
  lines.push("# DualSub Translation Export");
  lines.push(`exported_at: ${exportedAt.toISOString()}`);
  lines.push(`total_records: ${records.length}`);

  records.forEach((record, index) => {
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
  if (records.length === 0) {
    throw new Error("No cached translations found yet.");
  }

  const timestamp = now();
  const txt = toTxt(records, new Date(timestamp));
  const filename = `dualsub-translations-${timestamp}.txt`;
  downloadTextFile(filename, txt);
  return {
    count: records.length,
    filename
  };
};

export {
  formatTimestamp,
  toTxt,
  mapPopupErrorMessage,
  withCallback,
  queryActiveTab,
  sendMessageToTab,
  exportTranslationsFromActiveTab
};
