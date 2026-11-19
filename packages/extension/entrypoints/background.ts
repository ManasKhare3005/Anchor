export default defineBackground(() => {
  // Clicking the toolbar icon opens the side panel (the My buttons shelf lives there from M2).
  void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});
