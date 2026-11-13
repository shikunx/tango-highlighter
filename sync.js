const syncBaseUrl = "https://tango.fanshikun.com/v1";
const deviceIdKey = "deviceId";
const deviceTokenKey = "deviceToken";

async function tangoApiRequest(method, url, body, token) {
  const response = await fetch(url, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let parsed = {};
  try {
    parsed = await response.json();
  } catch {}
  return { status: response.status, body: parsed };
}

async function getSyncDeviceId() {
  const stored = await getLocalStorage([deviceIdKey]);
  let deviceId = stored[deviceIdKey];
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    await setLocalStorage({ [deviceIdKey]: deviceId });
  }
  return deviceId;
}

async function isSyncActivated() {
  const stored = await getLocalStorage([deviceTokenKey]);
  return Boolean(stored[deviceTokenKey]);
}

async function activateSync(code) {
  const deviceId = await getSyncDeviceId();
  const response = await tangoApiRequest("POST", `${syncBaseUrl}/activate`, { code, deviceId });
  if (response.status === 404 || response.status === 403) {
    throw new Error(response.body.error || "activation rejected");
  }
  if (response.status !== 200) {
    throw new Error("sync server error");
  }
  await setLocalStorage({ [deviceTokenKey]: response.body.token });
}

async function syncRequest(method, path, body) {
  const stored = await getLocalStorage([deviceTokenKey]);
  const token = stored[deviceTokenKey];
  if (!token) {
    throw new Error("sync not activated");
  }

  const response = await tangoApiRequest(method, `${syncBaseUrl}${path}`, body, token);
  if (response.status === 401) {
    await setLocalStorage({ [deviceTokenKey]: "" });
    throw new Error("device token expired, activate again");
  }
  return response;
}

// Sync semantics: pull the remote list, merge as a union with the local one,
// push back; on a version conflict pull again, merge, and push once more.
// Deletions have no tombstones, so a stale other device can resurrect a
// deleted word through the union push. The list is append-mostly and that
// weakness is accepted.
async function syncWords(localWordsText) {
  const localWords = localWordsText ? localWordsText.split("\n") : [];
  const pull = await syncRequest("GET", "/words");
  if (pull.status !== 200) {
    throw new Error("sync pull failed");
  }
  const remote = pull.body;

  const merged = [...new Set([...localWords, ...remote.words])];
  if (merged.length === remote.words.length && merged.length === localWords.length) {
    return { words: merged, changed: false };
  }

  const push = await syncRequest("PUT", "/words", { version: remote.version, words: merged });
  if (push.status === 409) {
    const retry = await syncRequest("GET", "/words");
    if (retry.status !== 200) {
      throw new Error("sync retry pull failed");
    }
    const retryMerged = [...new Set([...merged, ...retry.body.words])];
    const retryPush = await syncRequest("PUT", "/words", { version: retry.body.version, words: retryMerged });
    if (retryPush.status !== 200) {
      throw new Error("sync push conflict");
    }
    return { words: retryMerged, changed: true };
  }
  if (push.status !== 200) {
    throw new Error("sync push failed");
  }
  return { words: merged, changed: true };
}

// Runs one sync round against the server and returns the merged list as
// newline-joined text, the storage format of the local word list.
async function runSync(localWordsText) {
  const result = await syncWords(localWordsText);
  return { text: result.words.join("\n"), changed: result.changed };
}
