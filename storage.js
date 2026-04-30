function getLocalStorage(keys) {
  return new Promise(function (resolve) {
    chrome.storage.local.get(keys, resolve);
  });
}

function setLocalStorage(items) {
  return new Promise(function (resolve) {
    chrome.storage.local.set(items, resolve);
  });
}
