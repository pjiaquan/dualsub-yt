import { run as runSelectorTests } from "./selector.test.js";
import { run as runOverlayTests } from "./overlay.test.js";
import { run as runStorageTests } from "./storage.test.js";
import { run as runIntegrationTests } from "./integration/watch-page.test.js";
import { run as runParserTests } from "./parser.test.js";
import { run as runOptionsTests } from "./options.test.js";
import { run as runPopupTests } from "./popup.test.js";

const runAll = async () => {
  await runSelectorTests();
  await runOverlayTests();
  await runStorageTests();
  await runParserTests();
  await runOptionsTests();
  await runPopupTests();
  await runIntegrationTests();
};

try {
  await runAll();
  console.log("All tests passed");
} catch (error) {
  console.error("Test failure:", error && error.message ? error.message : error);
  process.exit(1);
}
