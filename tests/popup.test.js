import {
  exportTranslationsFromActiveTab,
  formatSrtTime,
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
  assert(formatSrtTime(1.234) === "00:00:01,234", "formatSrtTime should keep milliseconds");

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
    [
      {
        startTime: 1.2,
        endTime: 3.4,
        sourceText: "Hello",
        translation: "你好"
      }
    ],
    new Date("2024-01-01T00:00:00.000Z")
  );

  assert(!txt.includes("# DualSub Translation Export"), "timed export should be SRT-like only");
  assert(!txt.includes("total_records: 1"), "timed export should not include metadata header");
  assert(txt.includes("00:00:01,200 --> 00:00:03,400"), "SRT timing line missing");
  assert(txt.includes("Hello\n你好"), "SRT cue should include source and translation lines");
  assert(!txt.includes("## Record 1"), "timed export should not include record blocks");
};

const runTxtFallbackFormatTests = () => {
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
    [],
    new Date("2024-01-01T00:00:00.000Z")
  );

  assert(txt.includes("# DualSub Translation Export"), "fallback TXT header missing");
  assert(txt.includes("total_records: 1"), "fallback TXT total records missing");
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
          timedCaptions: [
            {
              startTime: 8.5,
              endTime: 10.2,
              sourceText: "Water",
              translation: "水"
            }
          ],
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
  assert(downloaded[0].content.includes("00:00:08,500 --> 00:00:10,200"), "export should include SRT timing");
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
    sawEmptyMessage = error && error.message === "No cached translations or timed subtitles found yet.";
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

const runTimedOnlyExportTest = async () => {
  const downloaded = [];
  const extensionApi = {
    tabs: {
      query() {
        return Promise.resolve([{ id: 3 }]);
      },
      sendMessage() {
        return Promise.resolve({
          ok: true,
          records: [],
          timedCaptions: [
            {
              startTime: 12.04,
              endTime: 14.01,
              sourceText: "Good morning",
              translation: "早安"
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

  assert(result.count === 1, "timed-only export should report timed caption count");
  assert(downloaded.length === 1, "timed-only export should download a file");
  assert(downloaded[0].content.includes("00:00:12,040 --> 00:00:14,010"), "timed-only export should include SRT line");
};

const run = async () => {
  runFormatTests();
  runTxtFallbackFormatTests();
  runErrorMappingTests();
  await runExportSuccessPromiseApiTest();
  await runExportSuccessCallbackApiTest();
  await runTimedOnlyExportTest();
  await runExportErrorTests();
};

export { run };
