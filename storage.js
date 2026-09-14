function getLocalStorage(keys) {
  return chrome.storage.local.get(keys);
}

function setLocalStorage(items) {
  return chrome.storage.local.set(items);
}
