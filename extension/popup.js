const $ = id => document.getElementById(id);
const dot = c => `<span class="dot" style="background:${c}"></span>`;
const tl = n => Number(n).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cls = n => (n >= 0 ? "up" : "down");
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const send = msg => chrome.runtime.sendMessage(msg);
const MOBILG = "https://mobilg.phillip.com.tr/";

// ---- segmented control
async function show(t) {
  document.querySelectorAll("#nav button").forEach(b => b.classList.toggle("on", b.dataset.t === t));
  document.querySelectorAll("main > div").forEach(d => { d.hidden = d.dataset.p !== t; });
  chrome.storage.local.set({ tab: t });
  if (t === "history") renderHistory();
}
document.querySelectorAll("#nav button").forEach(b => { b.onclick = () => show(b.dataset.t); });

// ---- status + pending approvals
async function renderStatus() {
  const d = await fetch("http://127.0.0.1:18890/health").then(r => r.ok).catch(() => false);
  $("daemon").innerHTML = dot(d ? "#5aa469" : "#c4553c") + (d ? "sunucu açık" : "sunucu kapalı");
  const tabs = await chrome.tabs.query({ url: "https://mobilg.phillip.com.tr/*" });
  const live = tabs.some(t => !t.url.includes("/login"));
  $("tab").innerHTML = dot(live ? "#5aa469" : "#c4553c") + (live ? "MobilG açık" : "MobilG'ye giriş yap");

  const { pending = [] } = await chrome.storage.session.get("pending");
  const box = $("pending");
  document.querySelector('[data-t="orders"]').textContent = pending.length ? `Emirler (${pending.length})` : "Emirler";
  if (!pending.length) { box.innerHTML = "<small>Bekleyen emir yok.</small>"; return; }
  box.innerHTML = "";
  for (const j of pending) {
    const el = document.createElement("div");
    el.className = "card";
    el.textContent = j.preview || JSON.stringify(j.body);
    const yes = Object.assign(document.createElement("button"), { className: "act yes", textContent: "Onayla" });
    const no = Object.assign(document.createElement("button"), { className: "act no", textContent: "Reddet" });
    yes.onclick = () => send({ type: "approve", id: j.id, approve: true }).then(renderStatus);
    no.onclick = () => send({ type: "approve", id: j.id, approve: false }).then(renderStatus);
    el.append(document.createElement("br"), yes, " ", no);
    box.append(el);
  }
}

// ---- portfolio
async function renderPortfolio() {
  const box = $("portfolio");
  const r = await send({ type: "portfolio" });
  if (r && r.error === "no_tab") {            // the user's own click may open or focus MobilG; nothing else does
    box.innerHTML = `<p><small>MobilG açık değil ya da giriş yapılmamış.</small></p>`;
    const b = Object.assign(document.createElement("button"), { className: "act yes", textContent: "MobilG'yi aç ve giriş yap" });
    b.onclick = async () => {
      const [t] = await chrome.tabs.query({ url: MOBILG + "*" });
      if (t) { await chrome.tabs.update(t.id, { active: true }); chrome.windows.update(t.windowId, { focused: true }); }
      else chrome.tabs.create({ url: MOBILG });
      window.close();
    };
    box.append(b);
    return;
  }
  if (!r || r.error) { box.innerHTML = `<small>${esc((r && r.error) || "Cevap yok.")}</small>`; return; }
  const s = r.data.stockOrders || { rows: [] };
  const rows = s.rows.map(x => {
    const pct = x.cost ? (x.price / x.cost - 1) * 100 : 0;
    return `<tr><td>${esc(String(x.symbolWithGroup || x.imkb).replace(/\(.*\)/, ""))}</td><td>${x.quantity}</td>
      <td>${tl(x.cost)}</td><td>${tl(x.price)}</td>
      <td class="${cls(x.profitLoss)}">${tl(x.profitLoss)}</td><td class="${cls(pct)}">${pct.toFixed(1)}%</td></tr>`;
  }).join("");
  const bal = (r.data.balances && r.data.balances.rows) || [];
  const cash = bal.find(b => /Net Bakiye/i.test(b.description));
  const overall = bal.find(b => /OVERALL/i.test(b.description));
  box.innerHTML = `<table><thead><tr><th>Hisse</th><th>Adet</th><th>Maliyet</th><th>Fiyat</th><th>K/Z</th><th>%</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="6"><small>Pozisyon yok.</small></td></tr>'}</tbody>
    <tfoot><tr><td colspan="4">Toplam K/Z</td><td class="${cls(s.totalProfitLoss)}">${tl(s.totalProfitLoss || 0)}</td><td></td></tr></tfoot></table>
    <div class="row"><span>Hisse değeri</span><span>${tl(s.totalAmount || 0)} TL</span></div>
    ${cash ? `<div class="row"><span>Nakit (T / T+2)</span><span>${tl(cash.tBalance)} / ${tl(cash.t2Balance)} TL</span></div>` : ""}
    ${overall ? `<div class="row"><span>Toplam</span><span>${tl(overall.tBalance)} TL</span></div>` : ""}`;
  $("asof").textContent = new Date().toLocaleTimeString("tr-TR");
}

// ---- order switches and limits
const DEFAULTS = { maxOrder: 2500, maxDaily: 10000, autoHours: 4 };
async function limits() {
  const { limits = {} } = await chrome.storage.local.get("limits");
  return { ...DEFAULTS, ...limits };
}
async function renderOrders() {
  const { ordersEnabled = true } = await chrome.storage.local.get("ordersEnabled");
  $("orders-on").checked = ordersEnabled;
  const lim = await limits();
  $("max-order").value = lim.maxOrder; $("max-daily").value = lim.maxDaily; $("auto-hours").value = lim.autoHours;
  const { autoUntil = 0 } = await chrome.storage.session.get("autoUntil");
  const on = Date.now() < autoUntil;
  $("auto-on").checked = on;
  $("auto-left").textContent = on ? `Açık · ${Math.ceil((autoUntil - Date.now()) / 60000)} dk kaldı` : "Kapalı";
  $("auto-card").classList.toggle("warn", on);
}
$("orders-on").onchange = async () => {
  await chrome.storage.local.set({ ordersEnabled: $("orders-on").checked });
  send({ type: "settings" });
};
for (const [id, key] of [["max-order", "maxOrder"], ["max-daily", "maxDaily"], ["auto-hours", "autoHours"]]) {
  $(id).onchange = async () => {
    const lim = await limits(), v = Number($(id).value);
    if (!(v > 0) || (key === "autoHours" && v > 24)) return renderOrders();     // ignore invalid input
    await chrome.storage.local.set({ limits: { ...lim, [key]: v } });
    send({ type: "settings" });
  };
}
$("auto-on").onchange = async () => {
  const lim = await limits();
  if ($("auto-on").checked && !confirm(`Onaysız gönderim açılsın mı?\n\nYapay zeka ajanları ${tl(lim.maxOrder)} TL altındaki limit emirleri SANA SORMADAN gerçek hesabına gönderebilecek (günlük en çok ${tl(lim.maxDaily)} TL).\n${lim.autoHours} saat sonra ya da tarayıcı kapanınca kendiliğinden kapanır.`)) $("auto-on").checked = false;
  await chrome.storage.session.set({ autoUntil: $("auto-on").checked ? Date.now() + lim.autoHours * 3600 * 1000 : 0 });
  send({ type: "settings" });
  renderOrders();
};

// ---- history (paginated)
const PER_PAGE = 8; let page = 0;
const KIND = { order: "Yeni emir", order_amend: "Düzeltme", order_cancel: "İptal" };
const MODE = { auto: "onaysız gönderildi", approved: "onayınla gönderildi", rejected: "reddettin" };
async function renderHistory() {
  const { history = [] } = await chrome.storage.local.get("history");
  const pages = Math.max(1, Math.ceil(history.length / PER_PAGE));
  page = Math.min(page, pages - 1);
  $("history").innerHTML = history.slice(page * PER_PAGE, (page + 1) * PER_PAGE).map(h =>
    `<div class="h"><span class="${h.ok ? "up" : "down"}">${h.ok ? "✓" : "✕"}</span> <b>${KIND[h.kind] || h.kind}</b> · ${esc(MODE[h.mode] || h.mode)}
     <small>${esc(h.preview)}</small><small>${new Date(h.t).toLocaleString("tr-TR")} · ${esc(h.message)}</small></div>`).join("")
    || "<small>Henüz emir yok.</small>";
  $("page").textContent = `${page + 1} / ${pages}`;
  $("prev").disabled = page === 0; $("next").disabled = page >= pages - 1;
}
$("prev").onclick = () => { page--; renderHistory(); };
$("next").onclick = () => { page++; renderHistory(); };

// ---- updates + what's new
async function renderUpdate() {
  const u = await send({ type: "update" });
  const rel = await (await fetch(chrome.runtime.getURL("release.json"))).json();
  const loaded = chrome.runtime.getManifest().version;
  $("ver").textContent = "v" + loaded;
  const box = $("update");
  if (u && (u.forced || u.available)) {
    box.className = "banner" + (u.forced ? " forced" : "");
    box.textContent = u.forced ? `Zorunlu güncelleme: v${u.latest}. Güncellenene kadar çalışmaz.` : `Yeni sürüm hazır: v${u.latest}`;
    const b = Object.assign(document.createElement("button"), { textContent: "Güncelle" });
    b.onclick = async () => {
      b.disabled = true; b.textContent = "Güncelleniyor…";
      const r = await send({ type: "doUpdate" });
      if (r && r.error) { b.disabled = false; b.textContent = "Tekrar dene"; box.append(" " + r.error); }
    };
    box.append(b);
  }
  if (u && u.forced) { $("nav").hidden = true; document.querySelector("main").hidden = true; }
  const { seenVersion } = await chrome.storage.local.get("seenVersion");
  const notes = (u && u.notes) || rel.notes;
  $("news").innerHTML = Object.entries(notes).map(([v, items]) =>
    `<div class="${v === loaded && seenVersion !== loaded ? "new" : ""}">v${esc(v)}${v === loaded && seenVersion !== loaded ? " · yeni" : ""}</div>
     <ul>${items.map(i => `<li>${esc(i)}</li>`).join("")}</ul>`).join("")
    + (u && u.checkedAt ? `<small>Son güncelleme denetimi: ${new Date(u.checkedAt).toLocaleString("tr-TR")}</small>` : "");
  chrome.storage.local.set({ seenVersion: loaded });
}

// Firefox treats host permissions as optional until the user grants them; Chrome grants them at install.
const ORIGINS = { origins: ["https://mobilg.phillip.com.tr/*", "http://127.0.0.1/*"] };
chrome.permissions.contains(ORIGINS).then(ok => { $("perm").hidden = ok; });
$("perm-btn").onclick = async () => { if (await chrome.permissions.request(ORIGINS)) location.reload(); };

chrome.storage.local.get("tab").then(async ({ tab }) => {
  const { pending = [] } = await chrome.storage.session.get("pending");
  show(pending.length ? "orders" : tab || "portfolio");
});
renderStatus(); renderOrders(); renderUpdate(); renderPortfolio();
