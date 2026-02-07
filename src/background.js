(() => {
  "use strict";

  const MENU_ID = "dualsub-open-options";
  const MENU_TITLE = "Open DualSub Options";

  const extensionApi = globalThis.browser || globalThis.chrome;

  const createMenu = () => {
    if (!extensionApi?.contextMenus?.create) {
      return;
    }

    try {
      extensionApi.contextMenus.create(
        {
          id: MENU_ID,
          title: MENU_TITLE,
          contexts: ["action"]
        },
        () => {
          // Ignore duplicate/unsupported context errors across browser variants.
          void extensionApi?.runtime?.lastError;
        }
      );
    } catch (error) {
      // noop
    }
  };

  const rebuildMenu = () => {
    if (!extensionApi?.contextMenus) {
      return;
    }

    if (!extensionApi.contextMenus.removeAll) {
      createMenu();
      return;
    }

    try {
      const maybePromise = extensionApi.contextMenus.removeAll(() => {
        void extensionApi?.runtime?.lastError;
        createMenu();
      });

      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise.then(createMenu).catch(() => createMenu());
      }
    } catch (error) {
      createMenu();
    }
  };

  const handleMenuClick = (info) => {
    if (!info || info.menuItemId !== MENU_ID) {
      return;
    }

    if (extensionApi?.runtime?.openOptionsPage) {
      extensionApi.runtime.openOptionsPage();
    }
  };

  const init = () => {
    if (!extensionApi) {
      return;
    }

    if (extensionApi.contextMenus?.onClicked?.addListener) {
      extensionApi.contextMenus.onClicked.addListener(handleMenuClick);
    }

    if (extensionApi.runtime?.onInstalled?.addListener) {
      extensionApi.runtime.onInstalled.addListener(rebuildMenu);
    }

    if (extensionApi.runtime?.onStartup?.addListener) {
      extensionApi.runtime.onStartup.addListener(rebuildMenu);
    }

    rebuildMenu();
  };

  init();
})();
