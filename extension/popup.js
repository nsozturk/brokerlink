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
  if (t === "depth") renderDepth();
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
  // Border colour scale: red at -15 % or worse, through amber, to the greenest green at +15 % or better.
  const hue = pct => `border-color:hsl(${Math.max(0, Math.min(130, (pct + 15) / 30 * 130))} 62% 46%)`;
  const rows = s.rows.map(x => {
    const pct = x.cost ? (x.price / x.cost - 1) * 100 : 0;
    const day = x.dayPct === undefined ? "<td>–</td>" : `<td class="${cls(x.dayPct)}">${sign(x.dayPct)}</td>`;
    return `<tr><td>${name(x)}</td><td>${x.quantity}</td><td>${tl(x.cost)}</td><td>${tl(x.price)}</td>${day}
      <td class="pl l ${cls(x.profitLoss)}" style="${hue(pct)}">${tl(x.profitLoss)}</td><td class="pl r ${cls(pct)}" style="${hue(pct)}">${pct.toFixed(1)}%</td></tr>`;
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
  holdings = s.rows; depthLicence = r.data.depthLicence;
  renderDepth();
  renderCharts();
  $("asof").textContent = new Date().toLocaleTimeString("tr-TR");
}

// ---- depth tab: order-book ladder + last trades, or cumulative depth chart (portfolio holdings only)
const name = x => esc(String(x.symbolWithGroup || x.imkb).replace(/\(.*\)/, ""));
const sign = n => (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
const qty = n => Number(n || 0).toLocaleString("tr-TR");
let depthLicence = 0, depthView = "ladder";
function drawDepth(cv, lv) {
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight, g = cv.getContext("2d");
  cv.width = W * dpr; cv.height = H * dpr; g.scale(dpr, dpr);
  let a = 0, b = 0;
  const bids = lv.filter(l => l.bid > 0).map(l => [l.bid, b += l.bidQty || 0]), asks = lv.filter(l => l.ask > 0).map(l => [l.ask, a += l.askQty || 0]);
  const max = Math.max(a, b, 1), mid = W / 2, y = v => H - 16 - v / max * (H - 26);
  const side = (pts, dir, stroke, fill) => {          // step curve growing away from the mid price
    if (!pts.length) return;
    const step = (mid - 4) / pts.length;
    g.beginPath(); g.moveTo(mid, H - 16);
    pts.forEach(([, cum], i) => { g.lineTo(mid + dir * i * step, y(cum)); g.lineTo(mid + dir * (i + 1) * step, y(cum)); });
    g.lineTo(mid + dir * pts.length * step, H - 16); g.closePath();
    g.fillStyle = fill; g.fill(); g.strokeStyle = stroke; g.stroke();
  };
  side(bids, -1, "#5aa469", "rgba(90,164,105,.25)"); side(asks, 1, "#c4553c", "rgba(196,85,60,.25)");
  g.font = "10px -apple-system, sans-serif"; g.fillStyle = "#a8a49b";
  if (bids.length) { g.textAlign = "left"; g.fillText(tl(bids[bids.length - 1][0]), 2, H - 3); g.fillText(qty(b) + " lot alış", 2, 10); }
  if (asks.length) { g.textAlign = "right"; g.fillText(tl(asks[asks.length - 1][0]), W - 2, H - 3); g.fillText(qty(a) + " lot satış", W - 2, 10); }
  g.textAlign = "center"; g.fillText(bids.length && asks.length ? tl((bids[0][0] + asks[0][0]) / 2) : "", mid, H - 3);
}
function renderDepth() {
  const bar = $("depth-bar"); bar.innerHTML = "";
  for (const [v, label] of [["ladder", "Kademeler"], ["chart", "Derinlik grafiği"]]) {
    const b = Object.assign(document.createElement("button"), { className: "chip" + (depthView === v ? " on" : ""), textContent: label });
    b.onclick = () => { depthView = v; chrome.storage.local.set({ depthView }); renderDepth(); };
    bar.append(b);
  }
  const box = $("depth"), rows = holdings.filter(x => x.quote && x.quote.bid > 0);
  if (!rows.length) { box.innerHTML = "<small>Pozisyon yok ya da fiyat alınamadı.</small>"; return; }
  const noDepth = `<small>${depthLicence ? "Kademe verisi şu an gelmedi (piyasa kapalı olabilir)." : "Hesabında derinlik lisansı yok; kademeler ve derinlik grafiği için lisans gerekir (MobilG'den alınır). En iyi alış/satış ve son işlemler gösteriliyor."}</small>`;
  box.innerHTML = rows.map((x, i) => {
    const q = x.quote, spread = q.bid > 0 ? (q.ask / q.bid - 1) * 100 : 0;
    const pos = q.ceil > q.floor ? Math.max(0, Math.min(100, (x.price - q.floor) / (q.ceil - q.floor) * 100)) : 50;
    let body;
    if (depthView === "chart") body = x.depth ? `<canvas data-i="${i}" style="height:120px"></canvas>` : noDepth;
    else {
      body = noDepth;
      if (x.depth) {
        const max = Math.max(...x.depth.map(l => Math.max(l.bidQty || 0, l.askQty || 0)), 1);
        const tb = x.depth.reduce((a, l) => a + (l.bidQty || 0), 0), ta = x.depth.reduce((a, l) => a + (l.askQty || 0), 0);
        body = `<table class="depth"><tr><th>Alış lot</th><th>Alış</th><th>Satış</th><th>Satış lot</th></tr>` + x.depth.map(l =>
          `<tr><td style="background:linear-gradient(to left, rgba(90,164,105,.25) ${(l.bidQty || 0) / max * 100}%, transparent 0)">${qty(l.bidQty)}</td>
           <td class="up">${l.bid > 0 ? tl(l.bid) : ""}</td><td class="down">${l.ask > 0 ? tl(l.ask) : ""}</td>
           <td style="background:linear-gradient(to right, rgba(196,85,60,.25) ${(l.askQty || 0) / max * 100}%, transparent 0)">${qty(l.askQty)}</td></tr>`).join("") +
          `</table><small>Alış / satış dengesi: %${(tb / (tb + ta || 1) * 100).toFixed(0)} alış</small>`;
      }
      if (x.trades && x.trades.length) body += `<table class="depth" style="margin-top:8px"><tr><th>Saat</th><th>Lot</th><th>Fiyat</th></tr>` +
        x.trades.map((t, k) => { const nx = x.trades[k + 1], c = nx ? (t.price > nx.price ? "up" : t.price < nx.price ? "down" : "") : "";
          return `<tr><td>${esc(t.creationTime)}</td><td>${qty(t.quantity)}</td><td class="${c}">${tl(t.price)}</td></tr>`; }).join("") + `</table><small>Son işlemler</small>`;
    }
    return `<div class="card"><div class="row"><b style="color:var(--fg)">${name(x)}</b>
        <span>${tl(x.price)} ${x.dayPct === undefined ? "" : `<span class="${cls(x.dayPct)}">${sign(x.dayPct)}</span>`}</span></div>
      <div class="row"><span>Alış <b class="up">${tl(q.bid)}</b></span><span>Satış <b class="down">${tl(q.ask)}</b></span><span>Makas %${spread.toFixed(2)}</span></div>
      <div class="band"><i style="left:${pos}%"></i></div>
      <div class="row"><small>Taban ${tl(q.floor)}</small><small>Tavan ${tl(q.ceil)}</small></div>${body}</div>`;
  }).join("");
  box.querySelectorAll("canvas").forEach(cv => drawDepth(cv, rows[+cv.dataset.i].depth));
}
chrome.storage.local.get("depthView").then(o => { if (o.depthView) depthView = o.depthView; });

// ---- charts (drawn from MobilG's chart feed; portfolio holdings only)
let holdings = [], chartOpt = { range: "1A", type: "candle", ma: true, vol: true };
// Period shown -> [label, bar size, bars shown, days to fetch]. Counted in bars, so a range still shows the
// last session when the market is closed. YTD is cut by date instead.
const RANGES = { "1S": ["1 saat", "1", 60, 3], "1G": ["1 gün", "5", 100, 5], "3G": ["3 gün", "15", 100, 8], "1H": ["1 hafta", "30", 85, 12],
  "2H": ["2 hafta", "60", 85, 22], "1A": ["1 ay", "240", 45, 50], "2A": ["2 ay", "240", 90, 95], "3A": ["3 ay", "1D", 65, 130],
  "6A": ["6 ay", "1D", 130, 230], "YTD": ["YTD", "1D", 260, 400], "1Y": ["1 yıl", "1D", 250, 420] };
const TYPES = [["candle", "Mum"], ["line", "Çizgi"], ["area", "Alan"]];
const sma = (a, n) => a.map((_, i) => i < n - 1 ? null : a.slice(i - n + 1, i + 1).reduce((x, y) => x + y, 0) / n);
function draw(cv, d) {
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight, g = cv.getContext("2d");
  cv.width = W * dpr; cv.height = H * dpr; g.scale(dpr, dpr);
  const n = d.c.length, pad = 52, volH = chartOpt.vol && d.v ? 26 : 0, ph = H - volH - 12;
  const hi = Math.max(...d.h), lo = Math.min(...d.l), w = (W - pad) / n;
  const y = v => 6 + (hi - v) / ((hi - lo) || 1) * ph, x = i => i * w + w / 2;
  g.font = "10px -apple-system, sans-serif"; g.lineWidth = 1;
  for (const v of [hi, (hi + lo) / 2, lo]) {
    g.strokeStyle = "#3a3836"; g.beginPath(); g.moveTo(0, y(v)); g.lineTo(W - pad, y(v)); g.stroke();
    g.fillStyle = "#a8a49b"; g.fillText(tl(v), W - pad + 4, y(v) + 3);
  }
  if (volH) {
    const vm = Math.max(...d.v, 1);
    for (let i = 0; i < n; i++) {
      g.fillStyle = d.c[i] >= d.o[i] ? "rgba(90,164,105,.45)" : "rgba(196,85,60,.45)";
      const bh = d.v[i] / vm * (volH - 2); g.fillRect(x(i) - Math.max(1, w * 0.35), H - bh, Math.max(2, w * 0.7), bh);
    }
  }
  if (chartOpt.type === "candle") {
    for (let i = 0; i < n; i++) {
      g.strokeStyle = g.fillStyle = d.c[i] >= d.o[i] ? "#5aa469" : "#c4553c";
      g.beginPath(); g.moveTo(x(i), y(d.h[i])); g.lineTo(x(i), y(d.l[i])); g.stroke();
      g.fillRect(x(i) - Math.max(1, w * 0.35), Math.min(y(d.o[i]), y(d.c[i])), Math.max(2, w * 0.7), Math.max(1, Math.abs(y(d.o[i]) - y(d.c[i]))));
    }
  } else {
    g.beginPath(); d.c.forEach((v, i) => i ? g.lineTo(x(i), y(v)) : g.moveTo(x(i), y(v)));
    g.strokeStyle = "#d97757"; g.lineWidth = 1.6; g.stroke(); g.lineWidth = 1;
    if (chartOpt.type === "area") { g.lineTo(x(n - 1), 6 + ph); g.lineTo(x(0), 6 + ph); g.closePath(); g.fillStyle = "rgba(217,119,87,.18)"; g.fill(); }
  }
  if (chartOpt.ma) for (const [len, col] of [[7, "#e6c35c"], [25, "#b07fe0"]]) {
    g.beginPath(); let started = false;
    sma(d.c, len).forEach((v, i) => { if (v === null) return; started ? g.lineTo(x(i), y(v)) : g.moveTo(x(i), y(v)); started = true; });
    g.strokeStyle = col; g.stroke();
  }
}
function chip(label, on, click) {
  const b = Object.assign(document.createElement("button"), { className: "chip" + (on ? " on" : ""), textContent: label });
  b.onclick = async () => { click(); await chrome.storage.local.set({ chartOpt }); renderCharts(); };
  return b;
}
async function renderCharts() {
  const bar = $("chart-bar"); bar.innerHTML = "";
  if (!RANGES[chartOpt.range]) chartOpt.range = "1A";
  for (const [k, [label]] of Object.entries(RANGES)) bar.append(chip(label, chartOpt.range === k, () => { chartOpt.range = k; }));
  bar.append(document.createElement("br"));
  for (const [v, label] of TYPES) bar.append(chip(label, chartOpt.type === v, () => { chartOpt.type = v; }));
  bar.append(chip("MA 7/25", chartOpt.ma, () => { chartOpt.ma = !chartOpt.ma; }), chip("Hacim", chartOpt.vol, () => { chartOpt.vol = !chartOpt.vol; }));
  const box = $("charts");
  if (!holdings.length) { box.innerHTML = "<small>Pozisyon yok.</small>"; return; }
  box.innerHTML = "";
  const [, resolution, bars, days] = RANGES[chartOpt.range];
  for (const h of holdings) {
    const el = document.createElement("div"); el.className = "card";
    const sym = esc(String(h.symbolWithGroup || h.imkb).replace(/\(.*\)/, ""));
    el.innerHTML = `<div class="row"><b style="color:var(--fg)">${sym}</b><span class="chg"></span></div><canvas></canvas>`;
    box.append(el);
    send({ type: "chart", symbol: h.foreksCode, resolution, days, bars: bars + 25 }).then(r => {
      if (!r || r.error) { el.querySelector("canvas").replaceWith(Object.assign(document.createElement("small"), { textContent: (r && r.error) || "Grafik verisi yok." })); return; }
      const num = a => (a || []).map(Number), all = { o: num(r.data.o), h: num(r.data.h), l: num(r.data.l), c: num(r.data.c), v: num(r.data.v) };
      let keep = bars;
      if (chartOpt.range === "YTD") { const jan1 = new Date(new Date().getFullYear(), 0, 1) / 1000; keep = Math.max(2, num(r.data.t).filter(t => t >= jan1).length); }
      // ponytail: the moving averages are computed on the visible bars only, so their first 6 / 24 points are missing.
      const d = Object.fromEntries(Object.entries(all).map(([k, a]) => [k, a.slice(-keep)]));
      const chg = (d.c[d.c.length - 1] / d.o[0] - 1) * 100;
      el.querySelector(".chg").innerHTML = `${tl(d.c[d.c.length - 1])} <span class="${cls(chg)}">${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%</span>`;
      draw(el.querySelector("canvas"), d);
    });
  }
}
chrome.storage.local.get("chartOpt").then(o => { if (o.chartOpt) chartOpt = { ...chartOpt, ...o.chartOpt }; });

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
