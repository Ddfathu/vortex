"use strict";

const WebSocket = require("ws");
const net = require("net");
const dgram = require("dgram");
const http = require("http");
const url = require("url");
const fs = require("fs");
const os = require("os");
const { spawnSync } = require("child_process");

const BRAND = "VORTEX PROJECT";
const VLESS_PATH = process.env.VLESS_PATH || "/vless-vortex";
const TROJAN_PATH = process.env.TROJAN_PATH || "/trojan-vortex";
const SSH_WS_PATH = process.env.SSH_WS_PATH || "/ssh-ws";
const SSH_PUBLIC_HOST = process.env.SSH_PUBLIC_HOST || process.env.PUBLIC_HOST || process.env.VORTEX_HOST || "";
const SSH_PUBLIC_PATH = process.env.SSH_PUBLIC_PATH || process.env.PUBLIC_PATH || (SSH_PUBLIC_HOST ? "/" : SSH_WS_PATH);
const XRAY_PUBLIC_HOST = process.env.XRAY_PUBLIC_HOST || process.env.XRAY_HOST || "";
const VLESS_PUBLIC_HOST = process.env.VLESS_PUBLIC_HOST || XRAY_PUBLIC_HOST;
const TROJAN_PUBLIC_HOST = process.env.TROJAN_PUBLIC_HOST || XRAY_PUBLIC_HOST;
const SNI_PUBLIC_HOST = process.env.SNI_PUBLIC_HOST || process.env.RAILWAY_PUBLIC_HOST || process.env.RAILWAY_HOST || "";
const SSH_SNI_HOST = process.env.SSH_SNI_HOST || process.env.SSH_TCP_PROXY_HOST || SNI_PUBLIC_HOST;
const SSH_SNI_PORT = process.env.SSH_SNI_PORT || process.env.SSH_TCP_PROXY_PORT || process.env.SNI_PUBLIC_PORT || "443";
const SSH_HOST = process.env.SSH_HOST || "127.0.0.1";
const SSH_PORT = Number(process.env.SSH_PORT || process.env.SSHD_PORT || 22);
const SSH_SSL_PORT = process.env.SSH_SSL_PORT || "2443";
const SSH_LIMIT_IP = process.env.SSH_LIMIT_IP || "2";
const DATA_DIR = process.env.DATA_DIR || "/data";
const USERS_FILE = `${DATA_DIR}/users.txt`;
const ADMIN_PASS = process.env.ADMIN_PASS || process.env.SSH_PASSWORD || "vortex123";
const WS_READY_STATE_OPEN = 1;
const PROTOCOL_TROJAN = "trojan";
const PROTOCOL_VLESS = "vless";

function json(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,X-Admin-Pass"
  });
  res.end(JSON.stringify(payload));
}

function html(res, body) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0", "Pragma": "no-cache" });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => {
      data += chunk;
      if (data.length > 1024 * 1024) {
        reject(new Error("Body terlalu besar"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function safeUser(username) {
  const u = String(username || "").trim();
  return /^[a-z_][a-z0-9_-]{2,31}$/i.test(u) ? u : null;
}

function safePass(password) {
  const p = String(password || "");
  return p.length >= 4 && p.length <= 128 ? p : null;
}

function isoDateAfter(days) {
  const d = new Date(Date.now() + Number(days) * 86400000);
  return d.toISOString().slice(0, 10);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function ensureData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "");
}

function readUsers() {
  ensureData();
  const today = todayISO();
  const lines = fs.readFileSync(USERS_FILE, "utf8").split(/\r?\n/).filter(Boolean);
  return lines.map(line => {
    const [username, password, expired] = line.split(":");
    return { username, password, expired, active: !expired || expired >= today };
  }).filter(u => u.username);
}

function writeUsers(users) {
  ensureData();
  const text = users.map(u => `${u.username}:${u.password}:${u.expired}`).join("\n");
  fs.writeFileSync(USERS_FILE, text ? text + "\n" : "");
}

function requireAdmin(req) {
  return true;
}

function requireDeleteAdmin(req) {
  const provided = String(req.headers["x-admin-pass"] || "");
  return provided && provided === ADMIN_PASS;
}


function run(cmd, args, input) {
  const r = spawnSync(cmd, args, { input, encoding: "utf8" });
  return { code: r.status || 0, stdout: r.stdout || "", stderr: r.stderr || "" };
}

function linuxUserExists(username) {
  const r = run("id", [username]);
  return r.code === 0;
}

function createLinuxUser(username, password, expired) {
  if (!linuxUserExists(username)) {
    const r = run("useradd", ["-m", "-s", "/bin/bash", "-e", expired, username]);
    if (r.code !== 0) throw new Error(r.stderr || "Gagal useradd");
  } else {
    run("usermod", ["-e", expired, username]);
  }
  const c = run("chpasswd", [], `${username}:${password}\n`);
  if (c.code !== 0) throw new Error(c.stderr || "Gagal set password");
}

function deleteLinuxUser(username) {
  if (linuxUserExists(username)) {
    run("userdel", ["-f", username]);
  }
}

function createUser(username, password, days) {
  const u = safeUser(username);
  const p = safePass(password);
  const d = Number(days || 30);
  if (!u) throw new Error("Username harus 3-32 karakter: huruf/angka/_/- dan diawali huruf");
  if (!p) throw new Error("Password minimal 4 karakter");
  if (!Number.isFinite(d) || d < 1 || d > 3650) throw new Error("Expired days harus 1-3650");
  const expired = isoDateAfter(d);
  createLinuxUser(u, p, expired);
  const users = readUsers().filter(x => x.username !== u);
  users.push({ username: u, password: p, expired });
  writeUsers(users);
  return { username: u, password: p, expired };
}

function deleteUser(username) {
  const u = safeUser(username);
  if (!u) throw new Error("Username tidak valid");
  deleteLinuxUser(u);
  const users = readUsers().filter(x => x.username !== u);
  writeUsers(users);
  return { username: u, deleted: true };
}

class VortexCore {
  constructor() {
    this.wss = null;
    this.httpServer = null;
    this.activeUDPConnections = new Map();
    this.activeClients = 0;
    this.activeSSH = 0;
    this.stats = { rx: 0, tx: 0, sshRx: 0, sshTx: 0, startedAt: Date.now() };
  }

  async handleHttpRequest(req, res) {
    const parsed = url.parse(req.url, true);
    const pathname = parsed.pathname;

    if (req.method === "OPTIONS") return json(res, 204, {});

    if (pathname === "/api/stats") {
      const users = readUsers();
      return json(res, 200, {
        brand: BRAND,
        status: "running",
        uptime: Math.floor(process.uptime()),
        rx: this.stats.rx,
        tx: this.stats.tx,
        sshRx: this.stats.sshRx,
        sshTx: this.stats.sshTx,
        activeClients: this.activeClients,
        activeSSH: this.activeSSH,
        userCount: users.length,
        memory: process.memoryUsage(),
        loadavg: os.loadavg(),
        paths: { vless: VLESS_PATH, trojan: TROJAN_PATH, ssh: SSH_WS_PATH }
      });
    }

    if (pathname === "/api/users") {
      if (!requireAdmin(req)) return json(res, 401, { ok: false, error: "Unauthorized. Isi ADMIN_PASS yang benar." });
      if (req.method === "GET") return json(res, 200, { ok: true, users: readUsers().map(u => ({ username: u.username, password: u.password, expired: u.expired, active: u.active })) });
      if (req.method === "POST") {
        const body = JSON.parse((await readBody(req)) || "{}");
        const user = createUser(body.username, body.password, body.days || 30);
        return json(res, 200, { ok: true, user });
      }
      if (req.method === "DELETE") {
        const result = deleteUser(parsed.query.username);
        return json(res, 200, { ok: true, result });
      }
    }

    if (pathname === "/health" || pathname === "/api/health") return json(res, 200, { ok: true, brand: BRAND, ssh: "dropbear-same-settings", sshPath: SSH_WS_PATH, publicHost: SSH_PUBLIC_HOST, publicPath: SSH_PUBLIC_PATH, xrayPublicHost: XRAY_PUBLIC_HOST, vlessPublicHost: VLESS_PUBLIC_HOST, trojanPublicHost: TROJAN_PUBLIC_HOST, wsProxyPort: process.env.WS_INTERNAL_PORT || "8880" });

    if (pathname === "/" || pathname === "/dashboard") return html(res, this.dashboardHtml(req));

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("VORTEX PROJECT: route tidak ditemukan");
  }

  dashboardHtml(req) {
    const rawHost = SSH_PUBLIC_HOST || req.headers["x-forwarded-host"] || req.headers.host || "your-domain.up.railway.app";
    const host = String(rawHost).replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const publicPath = SSH_PUBLIC_PATH || SSH_WS_PATH;
    const xrayHost = String(XRAY_PUBLIC_HOST || host).replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const vlessHost = String(VLESS_PUBLIC_HOST || xrayHost || host).replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const trojanHost = String(TROJAN_PUBLIC_HOST || xrayHost || host).replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const sniHost = String(SNI_PUBLIC_HOST || host).replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const sshSniHost = String(SSH_SNI_HOST || sniHost || host).replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const sshSniPort = String(SSH_SNI_PORT || "443");
    const sshSslPort = String(process.env.SSH_SSL_PORT || SSH_SSL_PORT || "2443");
    const escHost = String(host).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
    return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
<title>VORTEX PROJECT // Railway Core</title>
<style>
:root{--bg:#07040f;--panel:#0e071d;--card:#140b2a;--line:#2c1a55;--text:#f4efff;--muted:#a99bc9;--a:#8b5cf6;--b:#22d3ee;--g:#19e58c;--r:#ff5577;--y:#ffd166;--shadow:rgba(0,0,0,.45)}*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}html,body{width:100%;min-height:100%;overflow-x:hidden}body{margin:0;background:radial-gradient(circle at 20% 0%,#24104a 0,#090511 44%,#030206 100%);color:var(--text);font-family:Inter,system-ui,-apple-system,Segoe UI,Arial,sans-serif}.wrap{width:min(1080px,100%);margin:auto;padding:16px}.hero{border:1px solid var(--line);background:linear-gradient(135deg,rgba(139,92,246,.26),rgba(34,211,238,.08));border-radius:24px;padding:18px;box-shadow:0 22px 80px var(--shadow)}.top{display:flex;gap:12px;justify-content:space-between;align-items:center;flex-wrap:wrap}.brand{font-weight:950;letter-spacing:1.5px;font-size:22px}.sub{color:var(--muted);margin-top:4px}.pill{border:1px solid rgba(25,229,140,.38);color:var(--g);padding:8px 12px;border-radius:999px;background:rgba(25,229,140,.09);font-weight:850;white-space:nowrap}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:14px}.card,.section{border:1px solid var(--line);background:rgba(20,11,42,.78);border-radius:18px;padding:14px}.label{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:1.4px}.num{font-size:26px;font-weight:950;margin-top:6px}.section{margin-top:14px;background:rgba(14,7,29,.84);border-radius:22px;padding:16px}h2{margin:0 0 12px 0;font-size:18px}.tabs{display:flex;gap:8px;overflow-x:auto;padding:2px 0 12px;margin-bottom:4px}.tab{width:auto;min-width:max-content;padding:10px 13px;border:1px solid var(--line);border-radius:999px;background:#090511;color:var(--muted);font-weight:850}.tab.active{background:linear-gradient(135deg,var(--a),#5b21b6);color:var(--text);border-color:transparent}input,button,select,textarea{width:100%;border-radius:14px;border:1px solid var(--line);background:#090511;color:var(--text);padding:12px;font-size:15px;outline:none}button{cursor:pointer;background:linear-gradient(135deg,var(--a),#5b21b6);font-weight:900;border:0;touch-action:manipulation;user-select:none;position:relative;z-index:5}button:active{transform:translateY(1px);filter:brightness(1.1)}button.secondary{background:linear-gradient(135deg,#0891b2,#155e75)}button.danger{background:linear-gradient(135deg,#dc2626,#7f1d1d)}button.ghost{background:#090511;border:1px solid var(--line);color:var(--text)}.row{display:grid;grid-template-columns:1fr 1fr 120px 140px;gap:10px}.row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}.row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}.hidden{display:none!important}pre{white-space:pre-wrap;word-break:break-word;background:#05030a;border:1px solid var(--line);padding:14px;border-radius:14px;color:#e9d5ff;min-height:78px}.users{width:100%;border-collapse:collapse;overflow:hidden}.users th,.users td{border-bottom:1px solid var(--line);padding:10px;text-align:left;vertical-align:middle}.users th{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:1px}.muted{color:var(--muted)}.ok{color:var(--g);font-weight:800}.bad{color:var(--r);font-weight:800}.paths{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.path{background:#05030a;border:1px solid var(--line);border-radius:14px;padding:12px}.toast{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);background:#100824;border:1px solid var(--line);color:var(--text);padding:11px 14px;border-radius:14px;box-shadow:0 12px 36px rgba(0,0,0,.5);z-index:99;max-width:92%;display:none}.toast.show{display:block}.tableWrap{overflow:auto;border:1px solid var(--line);border-radius:14px}@media(max-width:820px){.grid{grid-template-columns:1fr 1fr}.row,.row2,.row3,.paths{grid-template-columns:1fr}.wrap{padding:10px}.num{font-size:22px}.brand{font-size:19px}.section{padding:13px}.users{min-width:560px}}

    /* Compact action buttons for mobile user table */
    .user-actions{
      display:flex;
      gap:6px;
      min-width:220px;
      flex-wrap:wrap;
      align-items:center;
      justify-content:flex-start;
    }
    .user-actions button{
      width:auto !important;
      min-width:68px !important;
      height:34px !important;
      padding:7px 10px !important;
      border-radius:12px !important;
      font-size:12px !important;
      line-height:1 !important;
      margin:0 !important;
      flex:0 0 auto !important;
    }
    .user-actions .danger{
      min-width:74px !important;
    }
    @media (max-width: 520px){
      .user-actions{
        min-width:150px;
        gap:5px;
      }
      .user-actions button{
        min-width:58px !important;
        height:30px !important;
        padding:6px 8px !important;
        border-radius:10px !important;
        font-size:11px !important;
      }
      .user-actions .danger{
        min-width:62px !important;
      }
    }

  
    .users td button.secondary,
    .users td button.danger{
      width:auto !important;
      min-width:62px !important;
      height:30px !important;
      padding:6px 8px !important;
      border-radius:10px !important;
      font-size:11px !important;
      line-height:1 !important;
      margin:0 !important;
    }
    .users td div[style*="display:flex"]{
      gap:5px !important;
      min-width:190px !important;
      flex-wrap:wrap !important;
    }

  </style>
</head>
<body>
<div class="wrap">
  <div class="hero">
    <div class="top"><div><div class="brand">⚡ VORTEX PROJECT</div><div class="sub">Railway Core · SSH WS + VLESS + Trojan</div></div><div class="pill" id="statusPill">● ONLINE</div></div>
    <div class="grid">
      <div class="card"><div class="label">Uptime</div><div class="num" id="uptime">-</div></div>
      <div class="card"><div class="label">RX</div><div class="num" id="rx">-</div></div>
      <div class="card"><div class="label">TX</div><div class="num" id="tx">-</div></div>
      <div class="card"><div class="label">Client</div><div class="num" id="clients">-</div></div>
    </div>
  </div>

  <div class="section">
    <div class="tabs">
      <button class="tab active" data-tab="generator" type="button">Generator</button>
      <button class="tab" data-tab="ssh" type="button">SSH Manager</button>
      <button class="tab" data-tab="info" type="button">Info</button>
    </div>

    <div id="tab-generator">
      <h2>🚀 Config Generator</h2>
      <div class="paths">
        <div class="path"><b>VLESS WS</b><br><span class="muted">${VLESS_PATH}</span></div>
        <div class="path"><b>Trojan WS</b><br><span class="muted">${TROJAN_PATH}</span></div>
        <div class="path"><b>SSH WS</b><br><span class="muted">${SSH_WS_PATH}</span></div>
      </div><br>

      <div class="row3">
        <button type="button" data-action="gen" data-type="vless-ws">VLESS WS</button>
        <button type="button" class="secondary" data-action="gen" data-type="vless-sni">VLESS SNI</button>
        <button type="button" data-action="gen" data-type="trojan-ws">Trojan WS</button>
        <button type="button" class="secondary" data-action="gen" data-type="trojan-sni">Trojan SNI</button>
      </div><br>
      <div class="row2"><button type="button" class="ghost" data-action="copy-config">Copy Config</button><button type="button" class="ghost" data-action="clear-config">Clear</button></div><br>
      <pre id="config">Klik tombol generator.</pre>
    </div>

    <div id="tab-ssh" class="hidden">
      <h2>👤 SSH User Manager</h2>
      <p class="muted">Buat akun SSH asli dari panel ini. Setelah user dibuat, pilih tombol SSH WS atau SSH SNI sesuai kebutuhan.</p>
      <div class="row"><input id="sshUser" autocomplete="off" placeholder="username"><input id="sshPass" autocomplete="new-password" placeholder="password"><input id="sshDays" type="number" placeholder="hari" value="30"></div><br>
      <div class="row2"><button type="button" data-action="add-user">Tambah SSH</button><button type="button" class="secondary" data-action="load-users">Refresh User</button></div><br>
      <div id="usersBox"><p class="muted">Klik Refresh User.</p></div><br>
      <h2>📄 SSH Premium Output</h2>
      <div class="row2"><button type="button" class="ghost" data-action="copy-ssh-output">Copy SSH Output</button><button type="button" class="ghost" data-action="clear-ssh-output">Clear Output</button></div><br>
      <pre id="sshOutput">Buat user atau klik tombol SSH WS / SSH SNI pada daftar user.</pre>
    </div>

    <div id="tab-info" class="hidden">
      <h2>ℹ️ Railway Info</h2>
      <pre>Host: ${escHost}\nPublic Port: 443 via Railway HTTPS\nApp Internal: ENV PORT / 8080\nSSH Internal: 127.0.0.1:${SSH_PORT}\nSSH SSL/SNI Internal: ${sshSslPort}\nData: /data/users.txt\nBranding: VORTEX PROJECT\nWS/Xray Host: ${xrayHost}\nSNI Host: ${sniHost}</pre>
    </div>
  </div>
</div>
<div class="toast" id="toast"></div>
<script>
(function(){
  'use strict';
  const HOST = ${JSON.stringify(host)};
  const XRAY_HOST_CLIENT = ${JSON.stringify(xrayHost)};
  const VLESS_HOST_CLIENT = ${JSON.stringify(vlessHost)};
  const TROJAN_HOST_CLIENT = ${JSON.stringify(trojanHost)};
  const SNI_HOST_CLIENT = ${JSON.stringify(sniHost)};
  const SSH_SNI_HOST_CLIENT = ${JSON.stringify(sshSniHost)};
  const SSH_SNI_PORT_CLIENT = ${JSON.stringify(sshSniPort)};
  const SSH_SSL_PORT_CLIENT = ${JSON.stringify(sshSslPort)};
  const SSH_PUBLIC_PATH_CLIENT = ${JSON.stringify(publicPath)};
  const VLESS_PATH = ${JSON.stringify(VLESS_PATH)};
  const TROJAN_PATH = ${JSON.stringify(TROJAN_PATH)};
  const SSH_WS_PATH = ${JSON.stringify(SSH_WS_PATH)};
  const SSH_LIMIT_IP = ${JSON.stringify(SSH_LIMIT_IP)};
  const $ = (id) => document.getElementById(id);
  const els = {
    uptime: $('uptime'), rx: $('rx'), tx: $('tx'), clients: $('clients'), statusPill: $('statusPill'),
    config: $('config'), sshOutput: $('sshOutput'), adminPass: null, sshUser: $('sshUser'), sshPass: $('sshPass'), sshDays: $('sshDays'),
    genAdminPass: null, genSshUser: null,
    usersBox: $('usersBox'), toast: $('toast')
  };
  function showToast(msg){ els.toast.textContent = msg; els.toast.classList.add('show'); clearTimeout(showToast.t); showToast.t=setTimeout(()=>els.toast.classList.remove('show'),2200); }
  function uuid(){
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c==='x'?r:(r&3|8);return v.toString(16)});
  }
  function fmt(b){ b=Number(b)||0; if(!b)return '0 B'; const u=['B','KB','MB','GB','TB']; const i=Math.min(u.length-1,Math.floor(Math.log(b)/Math.log(1024))); return (b/Math.pow(1024,i)).toFixed(i?2:0)+' '+u[i]; }
  function dur(s){ s=Number(s)||0; const d=Math.floor(s/86400); s%=86400; const h=Math.floor(s/3600); s%=3600; const m=Math.floor(s/60); return (d?d+'d ':'')+h+'h '+m+'m'; }
  function esc(v){ return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  async function copyText(text){
    try { await navigator.clipboard.writeText(text); showToast('Config disalin.'); }
    catch(e){ showToast('Copy manual: tahan teks config lalu salin.'); }
  }
  async function stats(){
    try{
      const r=await fetch('/api/stats',{cache:'no-store'}); const j=await r.json();
      els.statusPill.textContent='● ONLINE'; els.statusPill.style.color='var(--g)';
      els.uptime.textContent=dur(j.uptime); els.rx.textContent=fmt((j.rx||0)+(j.sshRx||0)); els.tx.textContent=fmt((j.tx||0)+(j.sshTx||0)); els.clients.textContent=(j.activeClients||0)+' / SSH '+(j.activeSSH||0);
    }catch(e){ els.statusPill.textContent='● CHECK'; els.statusPill.style.color='var(--r)'; }
  }
  function humanDate(iso){
    if(!iso) return '-';
    const d = new Date(iso + 'T00:00:00');
    if(Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US',{month:'short',day:'2-digit',year:'numeric'});
  }
  function sshPremiumConfig(username, password, expired, mode){
    const u = username || 'username';
    const p = password || 'password';
    const exp = expired || 'sesuaikan masa aktif';
    const isSni = mode === 'sni';

    const wsHost = HOST;
    const wsPath = (typeof SSH_PUBLIC_PATH_CLIENT !== 'undefined' && SSH_PUBLIC_PATH_CLIENT) ? SSH_PUBLIC_PATH_CLIENT : '/';
    const sniHost = (typeof SNI_HOST_CLIENT !== 'undefined' && SNI_HOST_CLIENT) ? SNI_HOST_CLIENT : HOST;
    const sshSniHost = (typeof SSH_SNI_HOST_CLIENT !== 'undefined' && SSH_SNI_HOST_CLIENT) ? SSH_SNI_HOST_CLIENT : sniHost;
    const sshSniPort = (typeof SSH_SNI_PORT_CLIENT !== 'undefined' && SSH_SNI_PORT_CLIENT) ? SSH_SNI_PORT_CLIENT : '443';

    const finalHost = isSni ? sshSniHost : wsHost;
    const finalPort = isSni ? sshSniPort : '443';
    const finalPath = isSni ? '-' : wsPath;
    const finalMode = isSni ? 'SSH SNI / SSL DIRECT' : 'SSH WS / CLOUDFLARE TUNNEL';
    const payload = isSni
      ? 'SNI murni tidak memakai payload WS. Gunakan Host/SNI: '+finalHost
      : 'GET '+wsPath+' HTTP/1.1[crlf]Host: [host][crlf]Connection: Upgrade[crlf]Upgrade: websocket[crlf]User-Agent: [ua][crlf][crlf]';

    return [
      '──────────────────────────────',
      '        SSH ACCOUNT PREMIUM',
      '──────────────────────────────',
      'Brand          : VORTEX PROJECT',
      'Mode           : '+finalMode,
      'Domain         : '+finalHost,
      'Username       : '+u,
      'Password       : '+p,
      'Limit IP       : '+SSH_LIMIT_IP+' IP',
      'Port           : '+finalPort,
      'TLS/SNI        : '+(isSni ? 'ON / Railway TCP Proxy SSL' : 'ON'),
      'SNI            : '+finalHost,
      'Network        : '+(isSni ? 'SSL/TLS Direct' : 'WebSocket'),
      'Path           : '+finalPath,
      '──────────────────────────────',
      '        HTTP CUSTOM',
      '──────────────────────────────',
      finalHost+':'+finalPort+'@'+u+':'+p,
      '──────────────────────────────',
      '        PAYLOAD / INFO',
      '──────────────────────────────',
      payload,
      '──────────────────────────────',
      '        DETAIL INFORMATION',
      '──────────────────────────────',
      'Core           : Dropbear SSH',
      'Server         : Railway',
      'Expired        : '+exp,
      '──────────────────────────────',
      'Save Account   : copy dan simpan manual',
      '──────────────────────────────'
    ].join(String.fromCharCode(10));
  }
  function sshPremiumBothConfig(username, password, expired){
    return [
      '==================== SSH WS ====================',
      sshPremiumConfig(username, password, expired, 'ws'),
      '',
      '==================== SSH SNI ===================',
      sshPremiumConfig(username, password, expired, 'sni')
    ].join(String.fromCharCode(10));
  }
  function putSshOutput(out){
    if(els.sshOutput) {
      els.sshOutput.textContent = out;
      try { els.sshOutput.scrollIntoView({behavior:'smooth', block:'center'}); } catch(e) {}
    }
    if(els.config) els.config.textContent = out;
    copyText(out).catch(()=>{});
  }
  function gen(type){
    const id=uuid(); let out='';
    const wsHost = XRAY_HOST_CLIENT || HOST;
    const vlessWsHost = VLESS_HOST_CLIENT || wsHost;
    const trojanWsHost = TROJAN_HOST_CLIENT || wsHost;
    const sniHost = SNI_HOST_CLIENT || HOST;

    if(type==='vless' || type==='vless-ws'){
      out='vless://'+id+'@'+vlessWsHost+':443?encryption=none&security=tls&sni='+vlessWsHost+'&type=ws&host='+vlessWsHost+'&path='+encodeURIComponent(VLESS_PATH)+'#VORTEX-VLESS-WS';
    }
    if(type==='trojan' || type==='trojan-ws'){
      out='trojan://'+id+'@'+trojanWsHost+':443?security=tls&sni='+trojanWsHost+'&type=ws&host='+trojanWsHost+'&path='+encodeURIComponent(TROJAN_PATH)+'#VORTEX-TROJAN-WS';
    }
    if(type==='vless-sni'){
      out='vless://'+id+'@'+sniHost+':443?encryption=none&security=tls&sni='+sniHost+'&type=ws&host='+sniHost+'&path='+encodeURIComponent(VLESS_PATH)+'#VORTEX-VLESS-SNI';
    }
    if(type==='trojan-sni'){
      out='trojan://'+id+'@'+sniHost+':443?security=tls&sni='+sniHost+'&type=ws&host='+sniHost+'&path='+encodeURIComponent(TROJAN_PATH)+'#VORTEX-TROJAN-SNI';
    }

    els.config.textContent=out || 'Tipe config tidak dikenal.';
    copyText(out).catch(()=>{});
  }
  async function api(path,opt={}){
    opt.headers = Object.assign({}, opt.headers || {}, {'Content-Type':'application/json'});
    const r = await fetch(path,opt); let j={};
    try { j = await r.json(); } catch(e) {}
    if(!r.ok) throw new Error(j.error || 'Request gagal');
    return j;
  }
  async function addUser(){
    try{
      const username = els.sshUser.value.trim(); const password = els.sshPass.value; const days = Number(els.sshDays.value || 30);
      if(!username || !password) return showToast('Username dan password wajib diisi.');
      const created = await api('/api/users',{method:'POST',body:JSON.stringify({username,password,days})});
      const output = sshPremiumBothConfig(created.user.username, created.user.password, created.user.expired);
      putSshOutput(output);
      els.sshUser.value=''; els.sshPass.value=''; showToast('SSH user berhasil dibuat. Output WS dan SNI ditampilkan.'); await loadUsers();
    }catch(e){ showToast(e.message); }
  }
  async function delUser(username){
    if(!confirm('Hapus user "'+username+'"? Aksi ini permanen.')) return;
    const adminPass = prompt('Masukkan ADMIN_PASS untuk konfirmasi hapus user "'+username+'":');
    if(!adminPass) return showToast('Hapus dibatalkan.');
    try{
      await fetch('/api/users?username='+encodeURIComponent(username),{
        method:'DELETE',
        headers:{'Content-Type':'application/json','X-Admin-Pass':adminPass}
      }).then(async r=>{
        let j={}; try{ j=await r.json(); }catch(e){}
        if(!r.ok) throw new Error(j.error || 'Gagal hapus user');
        return j;
      });
      showToast('User dihapus.');
      await loadUsers();
    }
    catch(e){ showToast(e.message); }
  }
  async function loadUsers(){
    try{
      const j=await api('/api/users',{method:'GET'});
      if(!j.users || !j.users.length){ els.usersBox.innerHTML='<p class="muted">Belum ada user SSH.</p>'; return; }
      els.usersBox.innerHTML='<div class="tableWrap"><table class="users"><thead><tr><th>User</th><th>Expired</th><th>Status</th><th>Aksi</th></tr></thead><tbody>'+j.users.map(u=>'<tr><td>'+esc(u.username)+'</td><td>'+esc(u.expired)+'</td><td class="'+(u.active?'ok':'bad')+'">'+(u.active?'ACTIVE':'EXPIRED')+'</td><td><div style="display:flex;gap:8px;min-width:280px;flex-wrap:wrap"><button type="button" class="secondary" data-action="cfg-user" data-mode="ws" data-user="'+esc(u.username)+'" data-pass="'+esc(u.password||'')+'" data-exp="'+esc(u.expired)+'">SSH WS</button><button type="button" class="secondary" data-action="cfg-user" data-mode="sni" data-user="'+esc(u.username)+'" data-pass="'+esc(u.password||'')+'" data-exp="'+esc(u.expired)+'">SSH SNI</button><button type="button" class="danger" data-action="del-user" data-user="'+esc(u.username)+'">Delete</button></div></td></tr>').join('')+'</tbody></table></div>';
    }catch(e){ els.usersBox.innerHTML='<p class="bad">'+esc(e.message)+'</p>'; }
  }
  function openTab(name){
    document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active', b.dataset.tab===name));
    ['generator','ssh','info'].forEach(t=>{ const el=$('tab-'+t); if(el) el.classList.toggle('hidden', t!==name); });
  }
  document.addEventListener('click', function(ev){
    const btn = ev.target.closest('button'); if(!btn) return;
    if(btn.dataset.tab){ openTab(btn.dataset.tab); return; }
    const action = btn.dataset.action;
    if(action==='gen') return gen(btn.dataset.type);
    if(action==='copy-config') return copyText(els.config.textContent || '');
    if(action==='clear-config'){ els.config.textContent='Klik tombol generator.'; return; }
    if(action==='copy-ssh-output') return copyText((els.sshOutput && els.sshOutput.textContent) || '');
    if(action==='clear-ssh-output'){ if(els.sshOutput) els.sshOutput.textContent='Buat user atau klik tombol SSH WS / SSH SNI pada daftar user.'; return; }
    if(action==='cfg-user') return putSshOutput(sshPremiumConfig(btn.dataset.user, btn.dataset.pass, btn.dataset.exp, btn.dataset.mode || 'ws'));
    if(action==='add-user') return addUser();
    if(action==='load-users') return loadUsers();
    if(action==='del-user') return delUser(btn.dataset.user);
  }, {passive:false});
  stats(); setInterval(stats,2500);
})();
</script>
</body>
</html>`;
  }

  makeWsAcceptKey(key) {
    const crypto = require("crypto");
    const magic = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    return crypto.createHash("sha1").update(String(key || "") + magic).digest("base64");
  }

  handleDropbearRawUpgrade(req, clientSocket, head) {
    this.activeClients++;
    this.activeSSH++;
    this.stats.sshRx = this.stats.sshRx || 0;
    this.stats.sshTx = this.stats.sshTx || 0;

    const target = net.createConnection({ host: SSH_HOST, port: SSH_PORT });
    let closed = false;

    const closeAll = () => {
      if (closed) return;
      closed = true;
      this.activeClients = Math.max(0, this.activeClients - 1);
      this.activeSSH = Math.max(0, this.activeSSH - 1);
      try { clientSocket.destroy(); } catch (_) {}
      try { target.destroy(); } catch (_) {}
    };

    const writeResponse = () => {
      try {
        const headers = req.headers || {};
        const isWs = String(headers.upgrade || "").toLowerCase() === "websocket";
        if (isWs) {
          let wsKey = headers["sec-websocket-key"];
          if (!wsKey) wsKey = require("crypto").randomBytes(16).toString("base64");
          clientSocket.write(
            "HTTP/1.1 101 Switching Protocols\r\n" +
            "Upgrade: websocket\r\n" +
            "Connection: Upgrade\r\n" +
            "Sec-WebSocket-Accept: " + this.makeWsAcceptKey(wsKey) + "\r\n\r\n"
          );
        } else {
          clientSocket.write("HTTP/1.1 101 Switching Protocols\r\n\r\n");
        }
      } catch (_) {
        try { clientSocket.write("HTTP/1.1 101 Switching Protocols\r\n\r\n"); } catch (__) {}
      }
    };

    const cleanFirst = (chunk, first) => {
      if (!first || !chunk || !chunk.length) return chunk;
      const txt = chunk.toString("latin1");
      if (txt.includes("HTTP/") || txt.includes("PATCH") || txt.includes("GET ")) {
        const idx = txt.indexOf("SSH-");
        if (idx >= 0) return chunk.slice(idx);
        return Buffer.alloc(0);
      }
      return chunk;
    };

    let firstPacket = true;

    clientSocket.on("error", closeAll);
    clientSocket.on("close", closeAll);
    target.on("error", closeAll);
    target.on("close", closeAll);

    target.on("connect", () => {
      writeResponse();

      if (head && head.length) {
        const data = cleanFirst(Buffer.from(head), true);
        firstPacket = false;
        if (data.length) {
          this.stats.sshRx += data.length;
          target.write(data);
        }
      }

      clientSocket.on("data", chunk => {
        const data = cleanFirst(Buffer.from(chunk), firstPacket);
        firstPacket = false;
        if (!data.length) return;
        this.stats.sshRx += data.length;
        if (!target.destroyed) target.write(data);
      });

      target.on("data", chunk => {
        this.stats.sshTx += chunk.length;
        if (!clientSocket.destroyed) clientSocket.write(chunk);
      });
    });
  }

  async handleWebSocketConnection(ws, request) {
    const parsedUrl = url.parse(request.url, true);
    const path = parsedUrl.pathname;
    if (path === SSH_WS_PATH) return this.handleSSHWebSocket(ws);
    if (path === VLESS_PATH || path === TROJAN_PATH) return this.websocketHandler(ws);
    ws.close(1000, "Invalid VORTEX path");
  }

  handleSSHWebSocket(ws) {
    this.activeClients++;
    this.activeSSH++;
    const socket = net.createConnection({ host: SSH_HOST, port: SSH_PORT });
    let closed = false;
    const closeAll = () => {
      if (closed) return;
      closed = true;
      this.activeClients = Math.max(0, this.activeClients - 1);
      this.activeSSH = Math.max(0, this.activeSSH - 1);
      try { socket.destroy(); } catch (_) {}
      try { if (ws.readyState === WebSocket.OPEN) ws.close(); } catch (_) {}
    };
    socket.on("connect", () => {});
    socket.on("data", chunk => {
      this.stats.sshTx += chunk.length;
      if (ws.readyState === WebSocket.OPEN) ws.send(chunk);
    });
    socket.on("error", closeAll);
    socket.on("close", closeAll);
    ws.on("message", msg => {
      const chunk = Buffer.from(msg);
      this.stats.sshRx += chunk.length;
      if (!socket.destroyed) socket.write(chunk);
    });
    ws.on("close", closeAll);
    ws.on("error", closeAll);
  }

  async websocketHandler(ws) {
    this.activeClients++;
    let remoteSocketWrapper = { value: null };
    const cleanup = () => {
      this.activeClients = Math.max(0, this.activeClients - 1);
      if (remoteSocketWrapper.value) remoteSocketWrapper.value.end();
      this.cleanupUDPConnections(ws);
    };

    ws.on("message", async (message) => {
      try {
        const chunk = Buffer.from(message);
        this.stats.rx += chunk.length;
        if (remoteSocketWrapper.value) {
          remoteSocketWrapper.value.write(chunk);
          return;
        }
        const protocol = await this.protocolSniffer(chunk);
        let header = protocol === PROTOCOL_TROJAN ? this.readTrojanHeader(chunk) : this.readVlessHeader(chunk);
        if (header.hasError) throw new Error(header.message);
        if (header.isUDP) return await this.handleUDPOutbound(header.addressRemote, header.portRemote, chunk.slice(header.rawDataIndex), ws, header.version);
        this.handleTCPOutBound(remoteSocketWrapper, header.addressRemote, header.portRemote, header.rawClientData, ws, header.version);
      } catch (err) {
        ws.close(1011, err.message);
      }
    });
    ws.on("close", cleanup);
    ws.on("error", cleanup);
  }

  async protocolSniffer(buffer) {
    if (buffer.length >= 62) {
      const d = buffer.slice(56, 60);
      if (d[0] === 0x0d && d[1] === 0x0a && [0x01,0x03,0x7f].includes(d[2]) && [0x01,0x03,0x04].includes(d[3])) return PROTOCOL_TROJAN;
    }
    return PROTOCOL_VLESS;
  }

  async handleTCPOutBound(remoteSocket, addressRemote, portRemote, rawClientData, webSocket, responseHeader) {
    const tcpSocket = net.createConnection({ host: addressRemote, port: portRemote }, () => tcpSocket.write(rawClientData));
    remoteSocket.value = tcpSocket;
    tcpSocket.on("close", () => { try { webSocket.close(); } catch (_) {} });
    tcpSocket.on("error", () => { try { webSocket.close(); } catch (_) {} });
    this.remoteSocketToWS(tcpSocket, webSocket, responseHeader);
  }

  async handleUDPOutbound(targetAddress, targetPort, dataChunk, webSocket, responseHeader) {
    try {
      let protocolHeader = responseHeader;
      const key = `${targetAddress}:${targetPort}:${Date.now()}:${Math.random()}`;
      const udpSocket = dgram.createSocket("udp4");
      this.activeUDPConnections.set(key, { socket: udpSocket, webSocket });
      const closeUdp = () => { try { udpSocket.close(); } catch (_) {} this.activeUDPConnections.delete(key); };
      udpSocket.on("error", closeUdp);
      udpSocket.send(dataChunk, targetPort, targetAddress, err => { if (err) closeUdp(); });
      udpSocket.on("message", message => {
        this.stats.tx += message.length;
        if (webSocket.readyState === WebSocket.OPEN) {
          if (protocolHeader) { webSocket.send(Buffer.concat([Buffer.from(protocolHeader), message])); protocolHeader = null; }
          else webSocket.send(message);
        }
      });
      let idle = setTimeout(closeUdp, 30000);
      udpSocket.on("message", () => { clearTimeout(idle); idle = setTimeout(closeUdp, 30000); });
    } catch (_) {}
  }

  cleanupUDPConnections(webSocket) {
    for (const [key, c] of this.activeUDPConnections.entries()) {
      if (c.webSocket === webSocket) { try { c.socket.close(); } catch (_) {} this.activeUDPConnections.delete(key); }
    }
  }

  readVlessHeader(buffer) {
    if (buffer.length < 24) return { hasError: true, message: "invalid vless request" };
    const version = buffer[0];
    const optLength = buffer[17];
    const cmd = buffer[18 + optLength];
    let isUDP = false;
    if (cmd === 2) isUDP = true;
    else if (cmd !== 1) return { hasError: true, message: `command ${cmd} is not supported` };
    const portIndex = 18 + optLength + 1;
    if (buffer.length < portIndex + 4) return { hasError: true, message: "invalid vless header" };
    const portRemote = buffer.readUInt16BE(portIndex);
    let addressIndex = portIndex + 2;
    const addressType = buffer[addressIndex];
    let addressLength = 0;
    let addressValueIndex = addressIndex + 1;
    let addressValue = "";
    switch(addressType) {
      case 1: addressLength = 4; addressValue = Array.from(buffer.slice(addressValueIndex, addressValueIndex + 4)).join("."); break;
      case 2: addressLength = buffer[addressValueIndex]; addressValueIndex += 1; addressValue = buffer.slice(addressValueIndex, addressValueIndex + addressLength).toString(); break;
      case 3: addressLength = 16; { const ipv6=[]; for(let i=0;i<8;i++) ipv6.push(buffer.readUInt16BE(addressValueIndex+i*2).toString(16)); addressValue=ipv6.join(":"); } break;
      default: return { hasError: true, message: `invalid addressType ${addressType}` };
    }
    if (!addressValue) return { hasError: true, message: "empty address" };
    return { hasError:false, addressRemote:addressValue, portRemote, rawDataIndex:addressValueIndex+addressLength, rawClientData:buffer.slice(addressValueIndex+addressLength), version:Buffer.from([version,0]), isUDP };
  }

  readTrojanHeader(buffer) {
    const dataBuffer = buffer.slice(58);
    if (dataBuffer.length < 6) return { hasError: true, message: "invalid trojan request" };
    const cmd = dataBuffer[0];
    let isUDP = false;
    if (cmd === 3) isUDP = true;
    else if (cmd !== 1) return { hasError: true, message: "unsupported trojan command" };
    let addressType = dataBuffer[1];
    let addressLength = 0;
    let addressValueIndex = 2;
    let addressValue = "";
    switch(addressType) {
      case 1: addressLength = 4; addressValue = Array.from(dataBuffer.slice(addressValueIndex, addressValueIndex + 4)).join("."); break;
      case 3: addressLength = dataBuffer[addressValueIndex]; addressValueIndex += 1; addressValue = dataBuffer.slice(addressValueIndex, addressValueIndex + addressLength).toString(); break;
      case 4: addressLength = 16; { const ipv6=[]; for(let i=0;i<8;i++) ipv6.push(dataBuffer.readUInt16BE(addressValueIndex+i*2).toString(16)); addressValue=ipv6.join(":"); } break;
      default: return { hasError: true, message: `invalid addressType ${addressType}` };
    }
    if (!addressValue) return { hasError: true, message: "empty address" };
    const portIndex = addressValueIndex + addressLength;
    const portRemote = dataBuffer.readUInt16BE(portIndex);
    return { hasError:false, addressRemote:addressValue, portRemote, rawDataIndex:portIndex+4, rawClientData:dataBuffer.slice(portIndex+4), version:null, isUDP };
  }

  remoteSocketToWS(remoteSocket, webSocket, responseHeader) {
    let header = responseHeader;
    remoteSocket.on("data", chunk => {
      this.stats.tx += chunk.length;
      if (webSocket.readyState !== WS_READY_STATE_OPEN) { remoteSocket.destroy(); return; }
      if (header) { webSocket.send(Buffer.concat([Buffer.from(header), chunk])); header = null; }
      else webSocket.send(chunk);
    });
  }

  start(port = process.env.PORT || 8080) {
    ensureData();
    const server = http.createServer((req, res) => this.handleHttpRequest(req, res).catch(err => json(res, 500, { ok:false, error: err.message })));
    this.wss = new WebSocket.Server({ noServer: true, perMessageDeflate: false });
    this.wss.on("connection", (ws, req) => this.handleWebSocketConnection(ws, req));

    server.on("upgrade", (req, socket, head) => {
      const pathname = url.parse(req.url, true).pathname;
      if (pathname === SSH_WS_PATH) {
        return this.handleDropbearRawUpgrade(req, socket, head);
      }
      if (pathname === VLESS_PATH || pathname === TROJAN_PATH) {
        return this.wss.handleUpgrade(req, socket, head, ws => this.wss.emit("connection", ws, req));
      }
      try { socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n"); } catch (_) {}
      try { socket.destroy(); } catch (_) {}
    });
    const shutdown = () => {
      try { this.wss.clients.forEach(c => c.readyState === WebSocket.OPEN && c.close()); } catch (_) {}
      try { this.wss.close(); } catch (_) {}
      for (const [,c] of this.activeUDPConnections.entries()) { try { c.socket.close(); } catch (_) {} }
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 10000);
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
    server.listen(port, "0.0.0.0", () => console.log(`VORTEX PROJECT active on port ${port}`));
    this.httpServer = server;
  }
}

if (require.main === module) new VortexCore().start(process.env.PORT || 8080);
module.exports = VortexCore;
