const dot = c => `<span class="dot" style="background:${c}"></span>`;

async function render() {
  const d = await fetch("http://127.0.0.1:18890/health").then(r => r.ok).catch(() => false);
  document.getElementById("daemon").innerHTML = d ? dot("#5aa469") + "running" : dot("#c4553c") + "not running";
  const tabs = await chrome.tabs.query({ url: "https://mobilg.phillip.com.tr/*" });
  const live = tabs.some(t => !t.url.includes("/login"));
  document.getElementById("tab").innerHTML = live ? dot("#5aa469") + "open" : dot("#c4553c") + "open MobilG and log in";

  const { pending = [] } = await chrome.storage.session.get("pending");
  const box = document.getElementById("pending");
  if (!pending.length) { box.innerHTML = "<small>None.</small>"; return; }
  box.innerHTML = "";
  for (const j of pending) {
    const el = document.createElement("div");
    el.className = "card";
    el.textContent = j.preview || JSON.stringify(j.body);
    const yes = Object.assign(document.createElement("button"), { className: "yes", textContent: "Approve" });
    const no = Object.assign(document.createElement("button"), { className: "no", textContent: "Reject" });
    yes.onclick = () => chrome.runtime.sendMessage({ type: "approve", id: j.id, approve: true }, render);
    no.onclick = () => chrome.runtime.sendMessage({ type: "approve", id: j.id, approve: false }, render);
    el.append(document.createElement("br"), yes, " ", no);
    box.append(el);
  }
}
const tl = n => n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cls = n => (n >= 0 ? "up" : "down");

async function renderPortfolio() {
  const box = document.getElementById("portfolio");
  const r = await chrome.runtime.sendMessage({ type: "portfolio" });
  if (!r || r.error) { box.innerHTML = `<small>${(r && r.error) || "No answer."}</small>`; return; }
  const s = r.data.stockOrders || { rows: [] };
  const rows = s.rows.map(x => {
    const pct = x.cost ? (x.price / x.cost - 1) * 100 : 0;
    return `<tr><td>${String(x.symbolWithGroup || x.imkb).replace(/\(.*\)/, "")}</td><td>${x.quantity}</td>
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
  document.getElementById("asof").textContent = new Date().toLocaleTimeString("tr-TR");
}

async function renderUpdate() {
  const u = await chrome.runtime.sendMessage({ type: "update" });
  const rel = await (await fetch(chrome.runtime.getURL("release.json"))).json();
  const loaded = chrome.runtime.getManifest().version;
  document.getElementById("ver").textContent = "v" + loaded;
  const box = document.getElementById("update");
  if (u && (u.forced || u.available)) {
    box.className = "banner" + (u.forced ? " forced" : "");
    box.textContent = u.forced ? `Zorunlu güncelleme: v${u.latest}. Güncellenene kadar çalışmaz.` : `Yeni sürüm hazır: v${u.latest}`;
    const b = Object.assign(document.createElement("button"), { textContent: "Güncelle" });
    b.onclick = async () => {
      b.disabled = true; b.textContent = "Güncelleniyor…";
      const r = await chrome.runtime.sendMessage({ type: "doUpdate" });
      if (r && r.error) { b.disabled = false; b.textContent = "Tekrar dene"; box.append(" " + r.error); }
    };
    box.append(b);
  }
  if (u && u.forced) for (const id of ["sec-portfolio", "sec-orders"]) document.getElementById(id).hidden = true;
  if (u && u.checkedAt) document.getElementById("ver").textContent += " · son denetim " + new Date(u.checkedAt).toLocaleTimeString("tr-TR");
  const { seenVersion } = await chrome.storage.local.get("seenVersion");
  const notes = (u && u.notes) || rel.notes;            // daemon copy also lists versions newer than the loaded one
  document.getElementById("news").innerHTML = Object.entries(notes).map(([v, items]) =>
    `<div class="${v === loaded && seenVersion !== loaded ? "new" : ""}">v${v}${v === loaded && seenVersion !== loaded ? " · yeni" : ""}</div>
     <ul>${items.map(i => `<li>${i}</li>`).join("")}</ul>`).join("");
  chrome.storage.local.set({ seenVersion: loaded });
}

const sw = document.getElementById("orders-on");
chrome.storage.local.get("ordersEnabled").then(({ ordersEnabled = true }) => { sw.checked = ordersEnabled; });
sw.onchange = async () => {
  await chrome.storage.local.set({ ordersEnabled: sw.checked });
  chrome.runtime.sendMessage({ type: "settings" });
};

const yolo = document.getElementById("yolo-on");
async function renderYolo() {
  const { yoloUntil = 0 } = await chrome.storage.session.get("yoloUntil");
  const on = Date.now() < yoloUntil;
  yolo.checked = on;
  document.getElementById("yolo-left").textContent = on ? `(${Math.ceil((yoloUntil - Date.now()) / 60000)} dk)` : "";
  document.getElementById("orders-hint").textContent = on
    ? "YOLO AÇIK: 2.500 TL altındaki limit emirler onay sorulmadan gönderilir (günlük 10.000 TL). Piyasa emirleri ve üstü yine onay ister."
    : "Orders are sent only when you click Approve here. Agents cannot approve.";
  document.getElementById("orders-hint").style.color = on ? "var(--bad)" : "";
}
yolo.onchange = async () => {
  if (yolo.checked && !confirm("YOLO modu: yapay zeka ajanları 2.500 TL altındaki limit emirleri SANA SORMADAN gerçek hesabına gönderebilir (günlük 10.000 TL). 4 saat sonra ya da tarayıcı kapanınca kendiliğinden kapanır. Açılsın mı?")) yolo.checked = false;
  await chrome.storage.session.set({ yoloUntil: yolo.checked ? Date.now() + 4 * 3600 * 1000 : 0 });
  chrome.runtime.sendMessage({ type: "settings" });
  renderYolo();
};
renderYolo();

render();
renderUpdate();
renderPortfolio();
