importScripts("storage.js", "sync.js");

const knownWordsStorageKey = "knownWords";
const autoPushDelayMs = 5000;
let autoPushTimer = null;

async function readLocalWordsText() {
  const stored = await getLocalStorage([knownWordsStorageKey]);
  const value = stored[knownWordsStorageKey];
  return typeof value === "string" ? value : "";
}

// Skip the write when the merge changed nothing, otherwise this very write
// would retrigger onChanged and loop into another sync round.
async function writeMergedWords(text) {
  const current = await readLocalWordsText();
  if (current === text) {
    return;
  }
  await setLocalStorage({ [knownWordsStorageKey]: text });
}

async function runBackgroundSync() {
  if (!(await isSyncActivated())) {
    return;
  }

  try {
    const { text } = await runSync(await readLocalWordsText());
    await writeMergedWords(text);
  } catch (error) {
    console.error("background sync failed:", error);
  }
}

chrome.storage.onChanged.addListener(function (changes, areaName) {
  if (areaName !== "local" || !changes[knownWordsStorageKey]) {
    return;
  }

  if (autoPushTimer !== null) {
    clearTimeout(autoPushTimer);
  }
  autoPushTimer = setTimeout(function () {
    autoPushTimer = null;
    runBackgroundSync();
  }, autoPushDelayMs);
});

chrome.runtime.onStartup.addListener(runBackgroundSync);
chrome.runtime.onInstalled.addListener(runBackgroundSync);
