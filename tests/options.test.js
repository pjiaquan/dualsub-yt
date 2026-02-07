import { STORAGE_KEY } from "../src/shared/config.js";

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const createClassList = () => {
  const classes = new Set();
  return {
    add(name) {
      classes.add(name);
    },
    remove(name) {
      classes.delete(name);
    },
    toggle(name, force) {
      if (force === true) {
        classes.add(name);
        return true;
      }
      if (force === false) {
        classes.delete(name);
        return false;
      }
      if (classes.has(name)) {
        classes.delete(name);
        return false;
      }
      classes.add(name);
      return true;
    },
    contains(name) {
      return classes.has(name);
    }
  };
};

const createControl = (value = "") => {
  const listeners = new Map();
  return {
    value,
    style: {},
    disabled: false,
    textContent: "",
    classList: createClassList(),
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    async trigger(type, event = {}) {
      const handler = listeners.get(type);
      if (!handler) {
        return undefined;
      }
      return handler(event);
    }
  };
};

const createForm = () => {
  const form = createControl();
  form.primaryLang = createControl("en");
  form.secondaryLang = createControl("zh-Hant");
  form.subtitleDisplayMode = createControl("both");
  form.translationProvider = createControl("gemini");
  form.aiModel = createControl("gemini-2.0-flash");
  form.aiApiKey = createControl("");
  form.aiSourceLang = createControl("en");
  form.aiTargetLang = createControl("zh-Hant");
  form.aiMinChars = createControl("12");
  form.pocketBaseUrl = createControl("https://pb.example.com");
  form.pocketBaseCollection = createControl("translations");
  form.pocketBaseAuthCollection = createControl("users");
  form.pocketBaseEmail = createControl("demo@example.com");
  form.pocketBasePassword = createControl("");
  form.pocketBaseToken = createControl("");
  form.pocketBaseUserId = createControl("");
  form.fontSize = createControl("24");
  form.lineSpacing = createControl("1.1");
  form.opacity = createControl("0.9");
  form.position = createControl("bottom");
  form.topOffsetPx = createControl("72");
  form.bottomOffsetPx = createControl("72");
  return form;
};

const flush = async () => new Promise((resolve) => setTimeout(resolve, 0));

const base64UrlEncode = (value) =>
  Buffer.from(value, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const loadOptionsModule = async ({ initialSettings, fetchImpl, cacheKey }) => {
  const previousDocument = globalThis.document;
  const previousBrowser = globalThis.browser;
  const previousFetch = globalThis.fetch;

  const form = createForm();
  const status = createControl();
  const providerSelect = form.translationProvider;
  const aiSettings = createControl();
  const loginButton = createControl();
  const logoutButton = createControl();
  const authStatus = createControl();

  const elements = {
    "settings-form": form,
    status,
    translationProvider: providerSelect,
    "ai-settings": aiSettings,
    pocketBaseLogin: loginButton,
    pocketBaseLogout: logoutButton,
    pocketBaseAuthStatus: authStatus
  };

  let stored = {
    [STORAGE_KEY]: initialSettings
  };

  globalThis.document = {
    getElementById(id) {
      return elements[id] || null;
    }
  };

  globalThis.browser = {
    storage: {
      local: {
        async get(key) {
          return {
            [key]: stored[key]
          };
        },
        async set(value) {
          stored = {
            ...stored,
            ...value
          };
        }
      }
    }
  };

  globalThis.fetch = fetchImpl;

  const moduleUrl = new URL(`../src/options/options.js?test=${cacheKey}`, import.meta.url);
  await import(moduleUrl.href);
  await flush();

  return {
    form,
    status,
    providerSelect,
    aiSettings,
    loginButton,
    logoutButton,
    authStatus,
    readStored: () => stored[STORAGE_KEY],
    restore() {
      if (typeof previousDocument === "undefined") {
        delete globalThis.document;
      } else {
        globalThis.document = previousDocument;
      }

      if (typeof previousBrowser === "undefined") {
        delete globalThis.browser;
      } else {
        globalThis.browser = previousBrowser;
      }

      if (typeof previousFetch === "undefined") {
        delete globalThis.fetch;
      } else {
        globalThis.fetch = previousFetch;
      }
    }
  };
};

const runLoginTest = async () => {
  const fetchCalls = [];
  const ctx = await loadOptionsModule({
    cacheKey: `login-${Date.now()}`,
    initialSettings: {
      translationProvider: "gemini",
      pocketBaseUrl: "https://pb.example.com",
      pocketBaseCollection: "translations",
      pocketBaseAuthCollection: "users",
      pocketBaseEmail: "user@example.com",
      pocketBaseToken: ""
    },
    fetchImpl: async (url, options) => {
      fetchCalls.push({ url, options });
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            token: "token-123",
            record: {
              id: "user_abc"
            }
          };
        }
      };
    }
  });

  try {
    ctx.form.pocketBasePassword.value = "secret-password";
    await ctx.loginButton.trigger("click");
    await flush();

    assert(fetchCalls.length === 1, "expected one PocketBase auth request");
    assert(
      fetchCalls[0].url === "https://pb.example.com/api/collections/users/auth-with-password",
      "PocketBase auth endpoint mismatch"
    );

    const payload = JSON.parse(fetchCalls[0].options.body);
    assert(payload.identity === "user@example.com", "PocketBase identity mismatch");
    assert(payload.password === "secret-password", "PocketBase password mismatch");

    const saved = ctx.readStored();
    assert(saved.pocketBaseToken === "token-123", "token should be persisted after login");
    assert(saved.pocketBaseUserId === "user_abc", "user id should be persisted after login");
    assert(ctx.form.pocketBasePassword.value === "", "password field should be cleared after login");
    assert(ctx.authStatus.textContent.includes("Login successful"), "expected success auth status");
  } finally {
    ctx.restore();
  }
};

const runLogoutTest = async () => {
  const ctx = await loadOptionsModule({
    cacheKey: `logout-${Date.now()}`,
    initialSettings: {
      translationProvider: "gemini",
      pocketBaseUrl: "https://pb.example.com",
      pocketBaseCollection: "translations",
      pocketBaseAuthCollection: "users",
      pocketBaseEmail: "user@example.com",
      pocketBaseToken: "existing-token"
    },
    fetchImpl: async () => {
      throw new Error("fetch should not be called during logout");
    }
  });

  try {
    assert(ctx.authStatus.textContent.includes("token is saved"), "should show token-present status on init");
    await ctx.logoutButton.trigger("click");
    await flush();

    const saved = ctx.readStored();
    assert(saved.pocketBaseToken === "", "token should be cleared on logout");
    assert(ctx.form.pocketBasePassword.value === "", "password field should be cleared on logout");
    assert(ctx.authStatus.textContent.includes("Logged out"), "expected logout auth status");
  } finally {
    ctx.restore();
  }
};

const runLoginDecodeTokenFallbackTest = async () => {
  const payload = base64UrlEncode(JSON.stringify({ id: "user_from_token" }));
  const fakeToken = `header.${payload}.signature`;

  const ctx = await loadOptionsModule({
    cacheKey: `login-token-fallback-${Date.now()}`,
    initialSettings: {
      translationProvider: "gemini",
      pocketBaseUrl: "https://pb.example.com",
      pocketBaseCollection: "translations",
      pocketBaseAuthCollection: "users",
      pocketBaseEmail: "user@example.com",
      pocketBaseToken: ""
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          token: fakeToken
        };
      }
    })
  });

  try {
    ctx.form.pocketBasePassword.value = "secret-password";
    await ctx.loginButton.trigger("click");
    await flush();

    const saved = ctx.readStored();
    assert(saved.pocketBaseUserId === "user_from_token", "user id should decode from JWT payload when record.id missing");
  } finally {
    ctx.restore();
  }
};

const run = async () => {
  await runLoginTest();
  await runLogoutTest();
  await runLoginDecodeTokenFallbackTest();
};

export { run };
