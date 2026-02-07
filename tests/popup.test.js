import {
  exportTranslationsFromActiveTab,
  formatTimestamp,
  mapPopupErrorMessage,
  toTxt
} from "../src/popup/core.js";

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const runFormatTests = () => {
  assert(formatTimestamp(0) === "", "formatTimestamp should ignore invalid zero values");
  assert(formatTimestamp(1700000000000) === "2023-11-14T22:13:20.000Z", "formatTimestamp mismatch");

  const txt = toTxt(
    [
      {
        videoId: "abc123",
        model: "gemini-2.0-flash",
        sourceLang: "en",
        targetLang: "zh-Hant",
        sourceText: "Hello",
        translation: "你好",
        updatedAt: 1700000000000
      }
    ],
    new Date("2024-01-01T00:00:00.000Z")
  );

  assert(txt.includes("# DualSub Translation Export"), "TXT header missing");
  assert(txt.includes("total_records: 1"), "TXT total records missing");
  assert(txt.includes("video_id: abc123"), "TXT video_id missing");
  assert(txt.includes("lang: en -> zh-Hant"), "TXT language line missing");
  assert(txt.includes("[source]\nHello"), "TXT source block missing");
  assert(txt.includes("[translation]\n你好"), "TXT translation block missing");
};

const runErrorMappingTests = () => {
  const mapped = mapPopupErrorMessage("Could not establish connection. Receiving end does not exist.");
  assert(
    mapped === "Open a YouTube watch page first, then try again.",
    "popup error mapping should guide user to open YouTube"
  );

  const passthrough = mapPopupErrorMessage("No cached translations found yet.");
  assert(passthrough === "No cached translations found yet.", "popup error mapping should preserve normal messages");
};

const runExportSuccessPromiseApiTest = async () => {
  const downloaded = [];
  const extensionApi = {
    tabs: {
      query() {
        return Promise.resolve([{ id: 7 }]);
      },
      sendMessage() {
        return Promise.resolve({
          ok: true,
          records: [
            {
              videoId: "vid-1",
              model: "gemini-2.0-flash",
              sourceLang: "en",
              targetLang: "zh-Hant",
              sourceText: "Water",
              translation: "水",
              updatedAt: 1700000000000
            }
          ]
        });
      }
    }
  };

  const result = await exportTranslationsFromActiveTab({
    extensionApi,
    now: () => 1700000000000,
    downloadTextFile(filename, content) {
      downloaded.push({ filename, content });
    }
  });

  assert(result.count === 1, "export should report one record");
  assert(result.filename === "dualsub-translations-1700000000000.txt", "export filename mismatch");
  assert(downloaded.length === 1, "download handler should be called once");
  assert(downloaded[0].content.includes("Water"), "export content should include source text");
  assert(downloaded[0].content.includes("水"), "export content should include translation text");
};

const runExportSuccessCallbackApiTest = async () => {
  const downloaded = [];
  const extensionApi = {
    runtime: {
      lastError: null
    },
    tabs: {
      query(_opts, callback) {
        callback([{ id: 9 }]);
      },
      sendMessage(_tabId, _message, callback) {
        callback({
          ok: true,
          records: [
            {
              sourceText: "Sky",
              translation: "天空",
              updatedAt: 1700000000000
            }
          ]
        });
      }
    }
  };

  const result = await exportTranslationsFromActiveTab({
    extensionApi,
    now: () => 1700000000000,
    downloadTextFile(filename, content) {
      downloaded.push({ filename, content });
    }
  });

  assert(result.count === 1, "callback API export should report one record");
  assert(downloaded.length === 1, "callback API should still trigger download");
};

const runExportErrorTests = async () => {
  const emptyRecordsApi = {
    tabs: {
      query() {
        return Promise.resolve([{ id: 7 }]);
      },
      sendMessage() {
        return Promise.resolve({
          ok: true,
          records: []
        });
      }
    }
  };

  let sawEmptyMessage = false;
  try {
    await exportTranslationsFromActiveTab({
      extensionApi: emptyRecordsApi,
      now: () => 1700000000000,
      downloadTextFile() {}
    });
  } catch (error) {
    sawEmptyMessage = error && error.message === "No cached translations found yet.";
  }
  assert(sawEmptyMessage, "export should throw empty-cache message");

  const noTabApi = {
    tabs: {
      query() {
        return Promise.resolve([]);
      },
      sendMessage() {
        return Promise.resolve({ ok: true, records: [] });
      }
    }
  };

  let sawNoTabMessage = false;
  try {
    await exportTranslationsFromActiveTab({
      extensionApi: noTabApi,
      now: () => 1700000000000,
      downloadTextFile() {}
    });
  } catch (error) {
    sawNoTabMessage = error && error.message === "No active tab found.";
  }
  assert(sawNoTabMessage, "export should throw when no active tab exists");
};

const run = async () => {
  runFormatTests();
  runErrorMappingTests();
  await runExportSuccessPromiseApiTest();
  await runExportSuccessCallbackApiTest();
  await runExportErrorTests();
};

export { run };
