import { isShelfRequest } from "../src/messages.ts";
import { createWriter } from "../src/writer.ts";

export default defineBackground(() => {
  // Clicking the toolbar icon opens the side panel, where the My buttons shelf lives.
  void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  // The only code that writes the shelf to storage.
  const write = createWriter(
    {
      get: (key) => browser.storage.local.get(key),
      set: (items) => browser.storage.local.set(items),
    },
    browser.runtime.id,
    browser.runtime.getURL("/"),
  );

  browser.runtime.onMessage.addListener((message: unknown, sender) => {
    if (!isShelfRequest(message)) return undefined;
    return write(message, sender);
  });
});
