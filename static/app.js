"use strict";
/* ============================ utilidades ============================ */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};
const fold = s => { let o = ""; for (let i = 0; i < s.length; i++) { const n = s[i].normalize("NFD")[0].toLowerCase(); o += n.length === 1 ? n : s[i]; } return o; };
const api = async (url, opt) => {
  const r = await fetch(url, opt);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
};
const fmtDT = iso => iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" }) : "";
const fmtD = iso => iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : "";
const fmtT = iso => iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
let toastT;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 1800); }
function safeUrl(u) { return /^https?:\/\//i.test(u || "") ? u : null; }
function domain(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } }

/* ============================ markdown ============================ */
function inline(s) {
  const codes = [];
  s = s.replace(/`([^`\n]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = esc(s);
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*\w])\*([^*\s](?:[^*]*?[^*\s])?)\*(?![*\w])/g, "$1<em>$2</em>");
  s = s.replace(/(^|[^\w])_([^_\s](?:[^_]*?[^_\s])?)_(?![_\w])/g, "$1<em>$2</em>");
  s = s.replace(/~~(.+?)~~/g, "<del>$1</del>");
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,;:!?])/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[i])}</code>`);
}

function md(src) {
  const lines = String(src ?? "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let i = 0;
  const isBlank = l => /^\s*$/.test(l);
  const listRe = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
  const tableSep = l => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l) && l.includes("-");
  const cells = l => l.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());
  const startsBlock = l => /^\s*(```|#{1,6}\s|>|([-*_])\s*(\2\s*){2,}$)/.test(l) || listRe.test(l);

  while (i < lines.length) {
    let l = lines[i];
    if (isBlank(l)) { i++; continue; }

    let m;
    if ((m = l.match(/^\s*```+\s*([\w+#.-]*)/))) {
      const lang = m[1]; const buf = []; i++;
      while (i < lines.length && !/^\s*```+\s*$/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<div class="codeblock"><div class="codehead"><span>${esc(lang || "texto")}</span><button data-copy>Copiar</button></div><pre><code>${esc(buf.join("\n"))}</code></pre></div>`);
      continue;
    }
    if ((m = l.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/))) {
      const n = Math.min(m[1].length + 1, 4); // # vira h2 para não competir com o título
      out.push(`<h${n}>${inline(m[2])}</h${n}>`); i++; continue;
    }
    if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(l)) { out.push("<hr>"); i++; continue; }
    if (/^\s*>/.test(l)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ""));
      out.push(`<blockquote>${md(buf.join("\n"))}</blockquote>`); continue;
    }
    if (l.includes("|") && i + 1 < lines.length && tableSep(lines[i + 1])) {
      const head = cells(l); i += 2; const rows = [];
      while (i < lines.length && !isBlank(lines[i]) && lines[i].includes("|")) rows.push(cells(lines[i++]));
      out.push("<table><thead><tr>" + head.map(c => `<th>${inline(c)}</th>`).join("") + "</tr></thead><tbody>" +
        rows.map(r => "<tr>" + head.map((_, k) => `<td>${inline(r[k] ?? "")}</td>`).join("") + "</tr>").join("") + "</tbody></table>");
      continue;
    }
    if (listRe.test(l)) {
      const items = [];
      while (i < lines.length) {
        const mm = lines[i].match(listRe);
        if (mm) { items.push({ indent: mm[1].replace(/\t/g, "    ").length, ordered: /\d/.test(mm[2]), text: mm[3] }); i++; continue; }
        if (isBlank(lines[i])) { // lista continua se o próximo não-vazio ainda é item
          let j = i; while (j < lines.length && isBlank(lines[j])) j++;
          if (j < lines.length && listRe.test(lines[j])) { i = j; continue; }
          break;
        }
        if (/^\s+\S/.test(lines[i]) && items.length) { items[items.length - 1].text += "\n" + lines[i].trim(); i++; continue; }
        break;
      }
      out.push(mdList(items)); continue;
    }
    const buf = [];
    while (i < lines.length && !isBlank(lines[i]) && (buf.length === 0 || !startsBlock(lines[i]))) {
      if (lines[i].includes("|") && i + 1 < lines.length && tableSep(lines[i + 1])) break;
      buf.push(lines[i++]);
    }
    out.push(`<p>${buf.map(inline).join("<br>")}</p>`);
  }
  return out.join("\n");
}
function mdList(items) {
  let html = ""; const stack = [];
  for (const it of items) {
    const tag = it.ordered ? "ol" : "ul";
    while (stack.length && it.indent < stack[stack.length - 1].indent) html += `</li></${stack.pop().tag}>`;
    const top = stack[stack.length - 1];
    if (top && it.indent === top.indent && top.tag !== tag) { html += `</li></${stack.pop().tag}>`; } // troca ul<->ol no mesmo nível
    if (stack.length && it.indent === stack[stack.length - 1].indent) html += `</li><li>${itemText(it.text)}`;
    else { html += `<${tag}><li>${itemText(it.text)}`; stack.push({ indent: it.indent, tag }); }
  }
  while (stack.length) html += `</li></${stack.pop().tag}>`;
  return html;
}
const itemText = t => t.split("\n").map(inline).join("<br>");

/* ============================ estado ============================ */
const S = {
  chats: [], byId: new Map(), filter: "all", sort: "recent",
  search: null, q: "", currentId: null, chat: null, tree: null, sel: {},
  status: null,
};
const ROOT = "__root__";

/* ============================ lista ============================ */
function visibleChats() {
  let list = S.chats.slice();
  if (S.filter === "pinned") list = list.filter(c => c.pinned);
  if (S.search) {
    const order = new Map(S.search.map((r, i) => [r.id, r]));
    list = list.filter(c => order.has(c.id)).sort((a, b) => order.get(a.id) && order.get(b.id) ? S.search.indexOf(order.get(a.id)) - S.search.indexOf(order.get(b.id)) : 0);
    return list;
  }
  const key = c => c.updated_at || c.inserted_at || "";
  list.sort((a, b) => S.sort === "recent" ? (b.pinned - a.pinned) || key(b).localeCompare(key(a))
    : S.sort === "old" ? key(a).localeCompare(key(b))
    : (b.message_count - a.message_count));
  return list;
}
function groupLabel(c) {
  if (c.pinned) return "Fixados";
  const d = new Date(c.updated_at || c.inserted_at); if (isNaN(d)) return "Sem data";
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const d0 = new Date(d); d0.setHours(0, 0, 0, 0);
  const days = Math.round((t0 - d0) / 864e5);
  if (days <= 0) return "Hoje";
  if (days === 1) return "Ontem";
  if (days <= 7) return "Últimos 7 dias";
  if (days <= 30) return "Últimos 30 dias";
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }).replace(/^./, x => x.toUpperCase());
}
const PIN = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M16 3l5 5-3 1-4 4 .5 4.5-1.5 1.5-3.5-3.5L5 20l-1-1 4.5-4.5L5 11l1.5-1.5L11 10l4-4z"/></svg>';

function renderList() {
  const list = visibleChats(); const el = $("#list");
  const bySearch = S.search ? new Map(S.search.map(r => [r.id, r])) : null;
  let html = "", last = null;
  for (const c of list) {
    if (!bySearch && S.sort === "recent") { const g = groupLabel(c); if (g !== last) { html += `<div class="group">${esc(g)}</div>`; last = g; } }
    const r = bySearch && bySearch.get(c.id);
    let sub = "";
    if (r && r.snippet) sub = `<div class="item-s">${esc(r.snippet.before)}<mark>${esc(r.snippet.match)}</mark>${esc(r.snippet.after)}</div>`;
    else if (c.preview) sub = `<div class="item-s">${esc(c.preview)}</div>`;
    html += `<button class="item${c.id === S.currentId ? " sel" : ""}" data-id="${esc(c.id)}" role="listitem">
      <div class="item-t">${c.pinned ? PIN : ""}<span class="t">${esc(c.title)}</span></div>
      <div class="item-m"><span>${esc(fmtD(c.updated_at || c.inserted_at))}</span><span>${plural(c.message_count, "msg", "msgs")}</span>${r ? `<span>${plural(r.count, "ocorrência", "ocorrências")}</span>` : ""}</div>${sub}</button>`;
  }
  if (!list.length) html = `<div class="empty-list">${S.search ? "Nenhum chat encontrado." : S.filter === "pinned" ? "Nenhum chat fixado." : "Nenhum chat carregado."}</div>`;
  el.innerHTML = html;
  const total = S.chats.reduce((n, c) => n + c.message_count, 0);
  $("#stats").textContent = `${plural(S.chats.length, "chat", "chats")} · ${plural(total, "mensagem", "mensagens")}`;
}

/* ============================ árvore de mensagens ============================ */
function buildTree(chat) {
  const msgs = chat.messages || [];
  const byId = new Map(msgs.map(m => [m.id, m]));
  const kids = new Map();
  for (const m of msgs) {
    const k = m.parent_id != null && byId.has(m.parent_id) ? m.parent_id : ROOT;
    if (!kids.has(k)) kids.set(k, []);
    kids.get(k).push(m);
  }
  const onPath = new Set();
  let cur = byId.get(chat.current_message_id);
  while (cur) { onPath.add(cur.id); cur = byId.get(cur.parent_id); }
  return { byId, kids, onPath };
}
function activePath() {
  const { kids, onPath } = S.tree; const out = [];
  let key = ROOT;
  for (let guard = 0; guard < 100000; guard++) {
    const list = kids.get(key); if (!list || !list.length) break;
    const chosen = list.find(m => m.id === S.sel[key]) || list.find(m => onPath.has(m.id)) || list[list.length - 1];
    out.push({ m: chosen, key, sibs: list });
    key = chosen.id;
  }
  return out;
}

/* ============================ renderização do chat ============================ */
const PROC = t => t === "THINK" || (t || "").startsWith("TOOL_");

function renderProcess(frags) {
  const think = frags.filter(f => f.type === "THINK");
  const searches = frags.filter(f => f.type === "TOOL_SEARCH");
  const opens = frags.filter(f => f.type === "TOOL_OPEN");
  const secs = think.reduce((n, f) => n + (parseFloat(f.elapsed_secs) || 0), 0);
  const bits = [];
  if (think.length) bits.push(secs ? `Raciocínio ${secs.toFixed(1).replace(".", ",")} s` : "Raciocínio");
  if (searches.length) bits.push(plural(searches.length, "busca", "buscas"));
  if (opens.length) bits.push(plural(opens.length, "página lida", "páginas lidas"));
  const open = store.get("ds_proc_open") === "1" ? " open" : "";
  let body = "";
  for (const f of frags) {
    if (f.type === "THINK") body += `<div class="step"><div class="step-l">Raciocínio</div><div class="think">${esc(f.content || "")}</div></div>`;
    else if (f.type === "TOOL_SEARCH") {
      const qs = (f.queries || []).map(q => `<span class="qchip">${esc(typeof q === "string" ? q : q.query || JSON.stringify(q))}</span>`).join("");
      const res = Array.isArray(f.results) ? f.results : [];
      body += `<div class="step"><div class="step-l">Busca na web</div><div class="queries">${qs}</div>` +
        (res.length ? `<details class="more"><summary>${plural(res.length, "resultado", "resultados")}</summary>${res.map(srcCard).join("")}</details>` : "") + "</div>";
    } else if (f.type === "TOOL_OPEN") body += `<div class="step"><div class="step-l">Página lida</div>${srcCard(f)}</div>`;
    else body += `<div class="step"><div class="step-l">${esc(f.type)}</div><div class="generic">${esc(JSON.stringify(f, null, 2))}</div></div>`;
  }
  return `<details class="proc"${open}><summary><b>Processo</b> ${esc(bits.join(" · ") || "etapas")}</summary><div class="proc-body">${body}</div></details>`;
}
function srcCard(r) {
  const u = safeUrl(r.url); const title = r.title || r.url || "(sem título)";
  const meta = [r.site_name || domain(r.url), r.published_at ? fmtD(r.published_at) : ""].filter(Boolean).join(" · ");
  const inner = `<div class="src-t">${esc(title)}</div><div class="src-m">${esc(meta)}</div>${r.snippet ? `<div class="src-s">${esc(r.snippet)}</div>` : ""}`;
  return u ? `<a class="src" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${inner}</a>` : `<div class="src">${inner}</div>`;
}

function renderMsg(entry) {
  const { m, key, sibs } = entry;
  const idx = sibs.indexOf(m);
  const branch = sibs.length > 1 ? `<div class="branch" data-key="${esc(String(key))}"><button data-d="-1" ${idx === 0 ? "disabled" : ""} title="Versão anterior">‹</button><span>${idx + 1}/${sibs.length}</span><button data-d="1" ${idx === sibs.length - 1 ? "disabled" : ""} title="Próxima versão">›</button></div>` : "";
  const frags = m.fragments || [];
  const time = fmtT(m.inserted_at);
  if (m.role === "USER") {
    const text = frags.filter(f => f.type === "REQUEST").map(f => f.content || "").join("\n");
    const extra = frags.filter(f => f.type !== "REQUEST").map(f => `<div class="note">${esc(f.file_name || f.type)}</div>`).join("");
    return `<div class="msg user" data-id="${esc(String(m.id))}"><div class="bubble md-raw">${esc(text)}</div>${extra}<div class="branch" style="gap:8px"><span>${esc(time)}</span></div>${branch}</div>`;
  }
  let html = `<div class="msg assistant" data-id="${esc(String(m.id))}"><div class="who"><span class="dot">D</span>DeepSeek<span class="time">${esc(time)}</span></div>`;
  let proc = [];
  const flush = () => { if (proc.length) { html += renderProcess(proc); proc = []; } };
  for (const f of frags) {
    if (PROC(f.type)) { proc.push(f); continue; }
    flush();
    if (f.type === "RESPONSE") html += `<div class="md">${md(f.content || "")}</div>`;
    else if (f.type === "CONTENT_RISK") html += `<div class="note">${esc(f.content || "")}</div>`;
    else if (typeof f.content === "string") html += `<div class="md">${md(f.content)}</div>`;
    else html += `<div class="generic">${esc(JSON.stringify(f, null, 2))}</div>`;
  }
  flush();
  if (m.status && m.status !== "FINISHED") html += `<div class="note">Status: ${esc(m.status)}</div>`;
  return html + branch + "</div>";
}

function renderChat(scrollTop = true) {
  const c = S.chat; const path = activePath();
  const nUser = path.filter(p => p.m.role === "USER").length;
  const flags = [];
  if (path.some(p => (p.m.fragments || []).some(f => f.type === "THINK"))) flags.push("raciocínio");
  if (path.some(p => (p.m.fragments || []).some(f => f.type === "TOOL_SEARCH"))) flags.push("busca na web");
  $("#view").innerHTML = `
    <div class="chat-head"><div class="chat-head-in">
      <div><h1 class="chat-title">${esc(c.title || "(sem título)")}</h1>
      <div class="chat-meta">${esc(fmtDT(c.inserted_at))} · ${plural(path.length, "mensagem", "mensagens")} (${plural(nUser, "pergunta", "perguntas")})${flags.length ? " · " + esc(flags.join(", ")) : ""}</div></div>
      <div class="chat-actions">
        <button class="btn ghost" id="procBtn" title="Expandir/recolher raciocínio e buscas">${store.get("ds_proc_open") === "1" ? "Recolher processo" : "Expandir processo"}</button>
        <button class="btn ghost" id="copyBtn">Copiar .md</button>
        <button class="btn ghost" id="dlBtn">Baixar .md</button>
      </div></div></div>
    <div class="convo" id="convo">${path.map(renderMsg).join("")}</div>`;
  if (scrollTop) $("#main").scrollTop = 0;
  highlightTerms();
}

function toMarkdown() {
  const c = S.chat; const path = activePath();
  let out = `# ${c.title || "Chat"}\n\n_${fmtDT(c.inserted_at)}_\n\n`;
  for (const { m } of path) {
    const fr = m.fragments || [];
    if (m.role === "USER") out += `## 🧑 Você\n\n${fr.filter(f => f.type === "REQUEST").map(f => f.content).join("\n")}\n\n`;
    else out += `## 🤖 DeepSeek\n\n${fr.filter(f => f.type === "RESPONSE").map(f => f.content).join("\n\n")}\n\n`;
  }
  return out.trim() + "\n";
}

/* destaque dos termos da busca dentro do chat aberto */
function highlightTerms() {
  const terms = fold(S.q || "").split(/\s+/).filter(Boolean);
  if (!terms.length) return;
  const root = $("#convo"); if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: n => n.parentElement.closest("details:not([open]),script,style") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
  });
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    const f = fold(n.nodeValue); const ranges = [];
    for (const t of terms) { let p = 0; while ((p = f.indexOf(t, p)) >= 0) { ranges.push([p, p + t.length]); p += t.length; } }
    if (!ranges.length) continue;
    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const r of ranges) { const l = merged[merged.length - 1]; if (l && r[0] <= l[1]) l[1] = Math.max(l[1], r[1]); else merged.push(r.slice()); }
    const frag = document.createDocumentFragment(); let pos = 0; const txt = n.nodeValue;
    for (const [a, b] of merged) {
      if (a > pos) frag.append(txt.slice(pos, a));
      const mk = document.createElement("mark"); mk.textContent = txt.slice(a, b); frag.append(mk); pos = b;
    }
    if (pos < txt.length) frag.append(txt.slice(pos));
    n.replaceWith(frag);
  }
  const first = root.querySelector("mark"); if (first) first.scrollIntoView({ block: "center" });
}

/* ============================ ações ============================ */
async function openChat(id, push = true) {
  try {
    S.chat = await api("/api/chats/" + encodeURIComponent(id));
  } catch (e) { toast("Erro ao abrir: " + e.message); return; }
  S.currentId = id; S.tree = buildTree(S.chat); S.sel = {};
  if (push) history.replaceState(null, "", "#" + encodeURIComponent(id));
  document.title = (S.chat.title || "Chat") + " · DeepSeek";
  renderList(); renderChat(); document.body.classList.remove("nav");
}

function welcome(msg) {
  $("#view").innerHTML = `<div class="welcome"><h1>${S.chats.length ? "Selecione um chat" : "Abra seu export do DeepSeek"}</h1>
    <p>${esc(msg || (S.chats.length ? "Escolha uma conversa na lista ao lado, ou busque por qualquer palavra." : "Nenhum export carregado ainda."))}</p>
    <div class="dropzone">Arraste o <b>.zip</b> do DeepSeek para esta janela<br><button class="btn" id="pickBtn">Escolher arquivo…</button></div></div>`;
}

let searchTimer, searchSeq = 0;
function onSearch() {
  clearTimeout(searchTimer);
  const q = $("#q").value.trim();
  searchTimer = setTimeout(async () => {
    S.q = q; const seq = ++searchSeq;
    if (!q) { S.search = null; renderList(); if (S.chat) renderChat(false); return; }
    try {
      const r = await api("/api/search?q=" + encodeURIComponent(q));
      if (seq !== searchSeq) return;
      S.search = r; renderList(); if (S.chat) renderChat(false);
    } catch (e) { toast(e.message); }
  }, 180);
}

async function loadAll(openFirst = true) {
  S.status = await api("/api/status");
  $("#brandSub").textContent = S.status.user ? `DeepSeek · ${S.status.user}` : "DeepSeek · arquivo local";
  if (!S.status.loaded) { S.chats = []; renderList(); welcome(); return; }
  S.chats = await api("/api/chats"); S.byId = new Map(S.chats.map(c => [c.id, c]));
  renderList();
  const hash = decodeURIComponent(location.hash.slice(1));
  const target = S.byId.has(hash) ? hash : (S.chats.length === 1 && openFirst ? S.chats[0].id : null);
  if (target) await openChat(target); else welcome();
}

async function uploadZip(file) {
  if (!file) return;
  toast("Carregando…");
  try {
    const r = await api("/api/load", { method: "POST", body: file });
    S.chat = null; S.currentId = null; S.search = null; $("#q").value = ""; S.q = "";
    history.replaceState(null, "", location.pathname);
    await loadAll(); toast(`${plural(r.count, "chat carregado", "chats carregados")}`);
  } catch (e) { toast(e.message); }
}

/* ============================ eventos ============================ */
document.addEventListener("click", e => {
  const t = e.target;
  const item = t.closest(".item"); if (item) return openChat(item.dataset.id);
  const chip = t.closest(".chip[data-f]");
  if (chip) { S.filter = chip.dataset.f; document.querySelectorAll(".chip[data-f]").forEach(c => c.classList.toggle("on", c === chip)); return renderList(); }
  if (t.closest("#sortBtn")) {
    S.sort = S.sort === "recent" ? "old" : S.sort === "old" ? "size" : "recent";
    $("#sortBtn").textContent = { recent: "Recentes", old: "Antigos", size: "Maiores" }[S.sort]; return renderList();
  }
  if (t.closest("#themeBtn")) { const n = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = n; store.set("ds_theme", n); return; }
  if (t.closest("#openBtn") || t.closest("#pickBtn")) return $("#file").click();
  if (t.closest("#menuBtn")) return document.body.classList.add("nav");
  if (t.closest("#scrim")) return document.body.classList.remove("nav");
  if (t.closest("#procBtn")) {
    const on = store.get("ds_proc_open") !== "1"; store.set("ds_proc_open", on ? "1" : "0");
    document.querySelectorAll("details.proc").forEach(d => d.open = on);
    t.closest("#procBtn").textContent = on ? "Recolher processo" : "Expandir processo"; return;
  }
  if (t.closest("#copyBtn")) { navigator.clipboard.writeText(toMarkdown()).then(() => toast("Chat copiado como Markdown"), () => toast("Não foi possível copiar")); return; }
  if (t.closest("#dlBtn")) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([toMarkdown()], { type: "text/markdown" }));
    a.download = (S.chat.title || "chat").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80) + ".md"; a.click(); URL.revokeObjectURL(a.href); return;
  }
  const cp = t.closest("[data-copy]");
  if (cp) { const code = cp.closest(".codeblock").querySelector("code").textContent; navigator.clipboard.writeText(code).then(() => { cp.textContent = "Copiado ✓"; setTimeout(() => cp.textContent = "Copiar", 1400); }); return; }
  const br = t.closest(".branch button[data-d]");
  if (br) {
    const wrap = br.closest(".branch"); const k = wrap.dataset.key; const kk = k === ROOT ? ROOT : (isNaN(+k) ? k : +k);
    const sibs = S.tree.kids.get(kk); const cur = activePath().find(p => p.key === kk).m;
    const nx = sibs[sibs.indexOf(cur) + (+br.dataset.d)]; if (nx) { S.sel[kk] = nx.id; const y = $("#main").scrollTop; renderChat(false); $("#main").scrollTop = y; }
  }
});
$("#q").addEventListener("input", onSearch);
$("#q").addEventListener("keydown", e => { if (e.key === "Escape") { e.target.value = ""; onSearch(); e.target.blur(); } });
document.addEventListener("keydown", e => {
  if (e.key === "/" && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); $("#q").focus(); $("#q").select(); }
});
$("#file").addEventListener("change", e => { uploadZip(e.target.files[0]); e.target.value = ""; });
let dragN = 0;
addEventListener("dragenter", e => { if ([...(e.dataTransfer?.types || [])].includes("Files")) { dragN++; $("#drop").classList.add("on"); } });
addEventListener("dragleave", () => { if (--dragN <= 0) { dragN = 0; $("#drop").classList.remove("on"); } });
addEventListener("dragover", e => e.preventDefault());
addEventListener("drop", e => { e.preventDefault(); dragN = 0; $("#drop").classList.remove("on"); const f = e.dataTransfer?.files?.[0]; if (f) uploadZip(f); });
addEventListener("hashchange", () => { const h = decodeURIComponent(location.hash.slice(1)); if (S.byId.has(h) && h !== S.currentId) openChat(h, false); });

/* ============================ início ============================ */
(function init() {
  const t = store.get("ds_theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.dataset.theme = t;
  if (/Mac/.test(navigator.platform)) $("#kbd").textContent = "/";
  loadAll().catch(e => welcome("Não consegui falar com o servidor local: " + e.message));
})();
