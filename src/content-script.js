(() => {
  "use strict";

  const STATE = {
    initialized: false
  };

  const isWatchPage = () => window.location.pathname === "/watch";

  const onReady = (callback) => {
    if (document.readyState === "complete" || document.readyState === "interactive") {
      callback();
      return;
    }
    document.addEventListener("DOMContentLoaded", callback, { once: true });
  };

  const init = () => {
    if (STATE.initialized || !isWatchPage()) {
      return;
    }
    STATE.initialized = true;
    window.__dualsub__ = { version: "0.1.0" };
  };

  onReady(init);
})();
