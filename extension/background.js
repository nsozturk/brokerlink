// brokerlink — runs allowlisted MobilG API calls inside the user's own logged-in tab.
// The session (clientId/otpToken) is read from the tab's localStorage INSIDE the tab and never leaves it.
// Never reloads or opens MobilG: a reload changes the client port and the server logs the session out.

const DAEMON = "http://127.0.0.1:18890";
const HOST = "https://mobilg.phillip.com.tr/";
let catalog = null;

async function loadCatalog() {
  if (!catalog) catalog = await (await fetch(chrome.runtime.getURL("catalog.json"))).json();
  return catalog;
}

function denied(path, cat) {
  return cat.denied_prefixes.some(p => path.toLowerCase().startsWith(p.toLowerCase()));
}

// Second, independent allowlist check (the daemon checks too).
async function resolve(job) {
  const cat = await loadCatalog();
  if (job.kind === "order") return { path: job.path, method: job.method || "POST", order: true };
  const e = cat.endpoints[job.name] || cat.writes[job.name];
  if (!e) throw new Error(`not in catalog: ${job.name}`);
  if (denied(e.path, cat)) throw new Error(`denied: ${e.path}`);
  return { path: e.path, method: e.method || "GET", auth: e.auth !== false, app_number: !!e.app_number, extra: e.extra || {} };
}

async function mobilgTab() {
  const tabs = await chrome.tabs.query({ url: HOST + "*" });
  const live = tabs.find(t => !t.url.includes("/login")) || null;
  return live;
}

// Executed inside the MobilG tab (isolated world shares the page's localStorage).
async function inTab(spec) {
  const auth = JSON.parse(localStorage.getItem("auth") || "{}");
  if (!auth.otpToken) return { status: 401, body: '{"error":"MobilG tab is not logged in"}' };
  const base = {
    clientId: auth.clientId, culture: auth.cultureName || "tr",
    ip: localStorage.getItem("clientip") || "", port: localStorage.getItem("clientport") || "",
    otpToken: auth.otpToken,
  };
  const u = new URL("/api/" + spec.path, location.origin);
  const q = spec.auth ? { ...base, ...spec.extra, ...spec.params } : { ...spec.params };
  if (spec.app_number) q.appNumber = auth.appNumber || "";
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null) u.searchParams.set(k, v);
  const init = { method: spec.method, headers: { accept: "application/json" } };
  if (spec.body) {
    const b = spec.auth_in_body ? { ...base, ...spec.body } : { ...spec.body };   // OrderTransaction/* wants auth in the body
    if (spec.app_number_in_body) b.appicationNumber = auth.appNumber || "";
    init.body = JSON.stringify(b);
    init.headers["content-type"] = "application/json";
  }
  const r = await fetch(u, init);
  return { status: r.status, body: await r.text() };
}

// Update check: the daemon serves release.json from disk; we compare it with the loaded build.
// forced = loaded build is older than min_supported -> no job runs until the user updates.
const cmp = (a, b) => { const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };
let updateState = { forced: false, available: false };
async function checkUpdate() {
  const loaded = chrome.runtime.getManifest().version;
  try {
    const rel = await (await fetch(`${DAEMON}/release`)).json();
    const needsPull = !!rel.remote && cmp(rel.remote.version, rel.version) > 0;   // origin/main is ahead of the disk
    const newest = needsPull ? rel.remote : rel;
    updateState = { loaded, latest: newest.version, forced: cmp(loaded, newest.min_supported) < 0,
                    available: cmp(loaded, newest.version) < 0, needsPull, notes: newest.notes,
                    checkedAt: rel.checked_at, checkError: rel.check_error };
  } catch { updateState = { loaded, forced: false, available: false }; }
  chrome.action.setBadgeText({ text: updateState.forced ? "!" : updateState.available ? "↑" : "" });
  chrome.action.setBadgeBackgroundColor({ color: updateState.forced ? "#c4553c" : "#d97757" });
  return updateState;
}

async function runJob(job) {
  if (updateState.forced) return { status: 426, body: '{"error":"brokerlink extension update required: open the popup and click Update"}' };
  const spec = await resolve(job);
  if (spec.order) {
    // Orders never run from the queue: they wait for a click in the popup (see approveOrder).
    const { pending = [] } = await chrome.storage.session.get("pending");
    pending.push(job);
    await chrome.storage.session.set({ pending });
    chrome.notifications.create(job.id, {
      type: "basic", iconUrl: "icons/128.png", title: "brokerlink: order waiting for you",
      message: job.preview || "Open the brokerlink popup to approve or reject.",
    });
    return { status: 202, body: JSON.stringify({ state: "awaiting_user_approval", id: job.id }) };
  }
  const tab = await mobilgTab();
  if (!tab) return { status: 409, body: '{"error":"Open https://mobilg.phillip.com.tr in Chrome and log in. brokerlink never opens or reloads it."}' };
  const [res] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: inTab,
    args: [{ ...spec, params: job.params || {}, body: job.body || null }],
  });
  return res.result;
}

async function post(path, payload) {
  await fetch(DAEMON + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
}

// Called from the popup after the user clicks Approve. The only path that sends an order.
async function approveOrder(id, approve) {
  const { pending = [] } = await chrome.storage.session.get("pending");
  const job = pending.find(j => j.id === id);
  await chrome.storage.session.set({ pending: pending.filter(j => j.id !== id) });
  if (!job) return;
  let result;
  if (!approve) result = { status: 499, body: '{"state":"rejected_by_user"}' };
  else {
    const tab = await mobilgTab();
    if (!tab) result = { status: 409, body: '{"error":"MobilG tab not open"}' };
    else {
      const [res] = await chrome.scripting.executeScript({
        target: { tabId: tab.id }, func: inTab,
        args: [{ path: job.path, method: job.method || "POST", auth: true, app_number: true,
                 app_number_in_body: true, auth_in_body: !!job.auth_in_body, extra: {}, params: {}, body: job.body }],
      });
      result = res.result;
    }
  }
  await post(`/jobs/${id}/result`, result);
}

let polling = false;
async function poll() {
  if (polling) return;
  polling = true;
  try {
    await checkUpdate();
    for (let i = 0; i < 40; i++) {                 // ~ one alarm period of long-polls
      const r = await fetch(`${DAEMON}/jobs/next`).catch(() => null);
      if (!r || r.status !== 200) { if (!r) break; continue; }
      const job = await r.json();
      let result;
      try { result = await runJob(job); }
      catch (e) { result = { status: 400, body: JSON.stringify({ error: String(e.message || e) }) }; }
      if (job.kind !== "order" || result.status !== 202) await post(`/jobs/${job.id}/result`, result);
    }
  } finally { polling = false; }
}

// Popup portfolio view: same in-tab call as the daemon's "portfolio", no daemon needed.
// Pull (when origin is ahead) and reload this unpacked extension from disk.
async function doUpdate() {
  await checkUpdate();
  if (updateState.needsPull) {
    const r = await fetch(`${DAEMON}/update`, { method: "POST" });
    if (!r.ok) return { error: (await r.json()).error || "git pull failed" };
  }
  setTimeout(() => chrome.runtime.reload(), 300);
  return { ok: true };
}

async function portfolio() {
  if ((await checkUpdate()).forced) return { error: "Update required." };
  const tab = await mobilgTab();
  if (!tab) return { error: "Open MobilG and log in." };
  const spec = await resolve({ name: "portfolio" });
  const date = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
  const [res] = await chrome.scripting.executeScript({
    target: { tabId: tab.id }, func: inTab, args: [{ ...spec, params: { date }, body: null }],
  });
  let body = res.result.body;
  for (let i = 0; i < 2 && typeof body === "string"; i++) { try { body = JSON.parse(body); } catch { break; } }
  return res.result.status === 200 ? { data: body } : { error: `MobilG answered ${res.result.status}` };
}

chrome.runtime.onMessage.addListener((msg, _s, reply) => {
  if (msg.type === "approve") approveOrder(msg.id, msg.approve).then(() => reply({ ok: true }));
  if (msg.type === "update") checkUpdate().then(reply);
  if (msg.type === "doUpdate") doUpdate().then(reply, e => reply({ error: String(e.message || e) }));
  if (msg.type === "portfolio") portfolio().then(reply, e => reply({ error: String(e.message || e) }));
  return true;
});
chrome.alarms.create("poll", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(poll);
chrome.runtime.onStartup.addListener(poll);
chrome.runtime.onInstalled.addListener(poll);
