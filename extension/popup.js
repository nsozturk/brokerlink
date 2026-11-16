const $ = id => document.getElementById(id);
const dot = c => `<span class="dot" style="background:${c}"></span>`;
const tl = n => Number(n).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cls = n => (n >= 0 ? "up" : "down");
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const send = msg => chrome.runtime.sendMessage(msg);
const MOBILG = "https://mobilg.phillip.com.tr/";
// Only a click by the user opens or focuses MobilG.
async function openMobilg() {
  const [t] = await chrome.tabs.query({ url: MOBILG + "*" });
  if (t) { await chrome.tabs.update(t.id, { active: true }); chrome.windows.update(t.windowId, { focused: true }); }
  else chrome.tabs.create({ url: MOBILG });
  window.close();
}

// ---- segmented control
async function show(t) {
  document.querySelectorAll("#nav button").forEach(b => b.classList.toggle("on", b.dataset.t === t));
  document.querySelectorAll("main > div").forEach(d => { d.hidden = d.dataset.p !== t; });
  if (t !== "news") chrome.storage.local.set({ tab: t });
  if (t === "history") renderHistory();
  if (t === "charts") renderCharts();
}
document.querySelectorAll("#nav button").forEach(b => { b.onclick = () => show(b.dataset.t); });
$("ver").onclick = () => show("news");          // release notes live behind the version label

// ---- status + pending approvals
async function renderStatus() {
  const d = await fetch("http://127.0.0.1:18890/health").then(r => r.ok).catch(() => false);
  $("daemon").innerHTML = dot(d ? "#5aa469" : "#c4553c") + (d ? "sunucu açık" : "sunucu kapalı");
  const tabs = await chrome.tabs.query({ url: "https://mobilg.phillip.com.tr/*" });
  const live = tabs.some(t => !t.url.includes("/login"));
  $("tab").innerHTML = dot(live ? "#5aa469" : "#c4553c") + (live ? "MobilG açık" : "MobilG'ye giriş yap");
  $("tab").style.cssText = live ? "" : "cursor:pointer;text-decoration:underline";
  $("tab").onclick = live ? null : openMobilg;

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
    b.onclick = openMobilg;
    box.append(b);
    return;
  }
  if (!r || r.error) { box.innerHTML = `<small>${esc((r && r.error) || "Cevap yok.")}</small>`; return; }
  const s = r.data.stockOrders || { rows: [] };
  const name = x => esc(String(x.symbolWithGroup || x.imkb).replace(/\(.*\)/, ""));
  // Border colour scale: red at -15 % or worse, through amber, to the greenest green at +15 % or better.
  const hue = pct => `border-color:hsl(${Math.max(0, Math.min(130, (pct + 15) / 30 * 130))} 62% 46%)`;
  const sign = n => (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
  const rows = s.rows.map(x => {
    const pct = x.cost ? (x.price / x.cost - 1) * 100 : 0;
    const day = x.dayPct === undefined ? "<td>–</td>" : `<td class="${cls(x.dayPct)}">${sign(x.dayPct)}</td>`;
    return `<tr><td>${name(x)}</td><td>${x.quantity}</td><td>${tl(x.cost)}</td><td>${tl(x.price)}</td>${day}
      <td class="pl l ${cls(x.profitLoss)}" style="${hue(pct)}">${tl(x.profitLoss)}</td><td class="pl r ${cls(pct)}" style="${hue(pct)}">${pct.toFixed(1)}%</td></tr>`;
  }).join("");
  // One small card per position: best bid/ask, spread, where the price sits in today's band, depth levels.
  const cards = s.rows.filter(x => x.quote && x.quote.bid > 0).map(x => {
    const q = x.quote, spread = q.bid > 0 ? (q.ask / q.bid - 1) * 100 : 0;
    const pos = q.ceil > q.floor ? Math.max(0, Math.min(100, (x.price - q.floor) / (q.ceil - q.floor) * 100)) : 50;
    let depth = `<small>${r.data.depthLicence ? "Kademe verisi şu an gelmedi (piyasa kapalı olabilir)." : "Hesabında derinlik lisansı yok; yalnız en iyi alış/satış gösteriliyor. Lisans MobilG'den alınır."}</small>`;
    if (x.depth) {
      const max = Math.max(...x.depth.map(l => Math.max(l.bidQty || 0, l.askQty || 0)), 1);
      const tb = x.depth.reduce((a, l) => a + (l.bidQty || 0), 0), ta = x.depth.reduce((a, l) => a + (l.askQty || 0), 0);
      depth = `<table class="depth"><tr><th>Alış adet</th><th>Alış</th><th>Satış</th><th>Satış adet</th></tr>` + x.depth.map(l =>
        `<tr><td style="background:linear-gradient(to left, rgba(90,164,105,.25) ${(l.bidQty || 0) / max * 100}%, transparent 0)">${(l.bidQty || 0).toLocaleString("tr-TR")}</td>
         <td class="up">${tl(l.bid)}</td><td class="down">${tl(l.ask)}</td>
         <td style="background:linear-gradient(to right, rgba(196,85,60,.25) ${(l.askQty || 0) / max * 100}%, transparent 0)">${(l.askQty || 0).toLocaleString("tr-TR")}</td></tr>`).join("") +
        `</table><small>Alış / satış dengesi: %${(tb / (tb + ta || 1) * 100).toFixed(0)} alış</small>`;
    }
    return `<div class="card"><div class="row"><b style="color:var(--fg)">${name(x)}</b>
        <span>${tl(x.price)} ${x.dayPct === undefined ? "" : `<span class="${cls(x.dayPct)}">${sign(x.dayPct)}</span>`}</span></div>
      <div class="row"><span>Alış <b class="up">${tl(q.bid)}</b></span><span>Satış <b class="down">${tl(q.ask)}</b></span><span>Makas %${spread.toFixed(2)}</span></div>
      <div class="band"><i style="left:${pos}%"></i></div>
      <div class="row"><small>Taban ${tl(q.floor)}</small><small>Tavan ${tl(q.ceil)}</small></div>${depth}</div>`;
  }).join("");
  const bal = (r.data.balances && r.data.balances.rows) || [];
  const cash = bal.find(b => /Net Bakiye/i.test(b.description));
  const overall = bal.find(b => /OVERALL/i.test(b.description));
  const totalCost = s.rows.reduce((a, x) => a + x.cost * x.quantity, 0), totalPct = totalCost ? (s.totalProfitLoss || 0) / totalCost * 100 : 0;
  box.innerHTML = `<table class="pf"><thead><tr><th>Hisse</th><th>Adet</th><th>Maliyet</th><th>Fiyat</th><th>Gün</th><th>K/Z</th><th>%</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="7"><small>Pozisyon yok.</small></td></tr>'}</tbody>
    <tfoot><tr><td colspan="5">Toplam K/Z</td><td class="pl l ${cls(s.totalProfitLoss)}" style="${hue(totalPct)}">${tl(s.totalProfitLoss || 0)}</td><td class="pl r ${cls(totalPct)}" style="${hue(totalPct)}">${totalPct.toFixed(1)}%</td></tr></tfoot></table>
    <small>Gün: bugünkü değişim. K/Z ve %: maliyetine göre toplam.</small>
    <div class="row"><span>Hisse değeri</span><span>${tl(s.totalAmount || 0)} TL</span></div>
    ${cash ? `<div class="row"><span>Nakit (T / T+2)</span><span>${tl(cash.tBalance)} / ${tl(cash.t2Balance)} TL</span></div>` : ""}
    ${overall ? `<div class="row"><span>Toplam</span><span>${tl(overall.tBalance)} TL</span></div>` : ""}`;
  $("depth").innerHTML = cards || "<small>Pozisyon yok.</small>";
  holdings = s.rows;
  renderCharts();
  $("asof").textContent = new Date().toLocaleTimeString("tr-TR");
}

// ---- charts (candles drawn from MobilG's chart feed; portfolio holdings only)
let holdings = [], range = "1A";
const RANGES = { "1G": { resolution: "15", days: 4, bars: 34 }, "1A": { resolution: "60", days: 40, bars: 90 }, "6A": { resolution: "1D", days: 200, bars: 120 } };
function draw(cv, d) {
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight, g = cv.getContext("2d");
  cv.width = W * dpr; cv.height = H * dpr; g.scale(dpr, dpr);
  const n = d.t.length, hi = Math.max(...d.h.map(Number)), lo = Math.min(...d.l.map(Number)), pad = 52;
  const y = v => 6 + (hi - v) / ((hi - lo) || 1) * (H - 12), w = (W - pad) / n;
  g.font = "10px -apple-system, sans-serif"; g.fillStyle = "#a8a49b"; g.strokeStyle = "#3a3836";
  for (const v of [hi, (hi + lo) / 2, lo]) { g.beginPath(); g.moveTo(0, y(v)); g.lineTo(W - pad, y(v)); g.stroke(); g.fillText(tl(v), W - pad + 4, y(v) + 3); }
  for (let i = 0; i < n; i++) {
    const o = +d.o[i], c = +d.c[i], x = i * w + w / 2;
    g.strokeStyle = g.fillStyle = c >= o ? "#5aa469" : "#c4553c";
    g.beginPath(); g.moveTo(x, y(+d.h[i])); g.lineTo(x, y(+d.l[i])); g.stroke();
    g.fillRect(x - Math.max(1, w * 0.35), Math.min(y(o), y(c)), Math.max(2, w * 0.7), Math.max(1, Math.abs(y(o) - y(c))));
  }
}
async function renderCharts() {
  document.querySelectorAll("#range button").forEach(b => b.classList.toggle("on", b.dataset.r === range));
  const box = $("charts");
  if (!holdings.length) { box.innerHTML = "<small>Pozisyon yok.</small>"; return; }
  box.innerHTML = "";
  for (const x of holdings) {
    const el = document.createElement("div"); el.className = "card";
    const sym = esc(String(x.symbolWithGroup || x.imkb).replace(/\(.*\)/, ""));
    el.innerHTML = `<div class="row"><b style="color:var(--fg)">${sym}</b><span class="chg"></span></div><canvas></canvas>`;
    box.append(el);
    send({ type: "chart", symbol: x.foreksCode, ...RANGES[range] }).then(r => {
      if (!r || r.error) { el.querySelector("canvas").replaceWith(Object.assign(document.createElement("small"), { textContent: (r && r.error) || "Grafik verisi yok." })); return; }
      const d = r.data, k = RANGES[range].bars, cut = a => a.slice(-k), dd = { t: cut(d.t), o: cut(d.o), h: cut(d.h), l: cut(d.l), c: cut(d.c) };
      const chg = (+dd.c[dd.c.length - 1] / +dd.o[0] - 1) * 100;
      el.querySelector(".chg").innerHTML = `${tl(+dd.c[dd.c.length - 1])} <span class="${cls(chg)}">${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%</span>`;
      draw(el.querySelector("canvas"), dd);
    });
  }
}
document.querySelectorAll("#range button").forEach(b => { b.onclick = () => { range = b.dataset.r; renderCharts(); }; });

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
  if (seenVersion !== loaded) $("ver").textContent += " · yeni";
  $("ver").addEventListener("click", () => chrome.storage.local.set({ seenVersion: loaded }), { once: true });
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
