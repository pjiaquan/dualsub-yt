import { run as runSelectorTests } from "./selector.test.js";
import { run as runOverlayTests } from "./overlay.test.js";
import { run as runStorageTests } from "./storage.test.js";
import { run as runIntegrationTests } from "./integration/watch-page.test.js";

const runAll = () => {
  runSelectorTests();
  runOverlayTests();
  runStorageTests();
  runIntegrationTests();
};

try {
  runAll();
  console.log("All tests passed");
} catch (error) {
  console.error("Test failure:", error && error.message ? error.message : error);
  process.exit(1);
}
