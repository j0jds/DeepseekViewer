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
  view: store.get("ds_view") === "topics" ? "topics" : "date",
  topics: null, tmap: new Map(), open: {}, topic: null,
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

function itemHtml(c, r) {
  let sub = "";
  if (r && r.snippet) sub = `<div class="item-s">${esc(r.snippet.before)}<mark>${esc(r.snippet.match)}</mark>${esc(r.snippet.after)}</div>`;
  else if (c.preview) sub = `<div class="item-s">${esc(c.preview)}</div>`;
  return `<button class="item${c.id === S.currentId ? " sel" : ""}" data-id="${esc(c.id)}" role="listitem">
      <div class="item-t">${c.pinned ? PIN : ""}<span class="t">${esc(c.title)}</span></div>
      <div class="item-m"><span>${esc(fmtD(c.updated_at || c.inserted_at))}</span><span>${plural(c.message_count, "msg", "msgs")}</span>${r ? `<span>${plural(r.count, "ocorrência", "ocorrências")}</span>` : ""}</div>${sub}</button>`;
}

/* ---- temas ---- */
const KIND_LABEL = { custom: "Meus temas", category: "Temas detectados", keyword: "Palavras-chave em comum" };
function topicGroups() {
  if (!S.topics) return [];
  const pinnedOnly = S.filter === "pinned";
  const ok = id => { const c = S.byId.get(id); return c && (!pinnedOnly || c.pinned); };
  const key = c => c.updated_at || c.inserted_at || "";
  const groups = S.topics.groups.map(g => ({ ...g, chats: g.chat_ids.filter(ok).map(id => S.byId.get(id)).sort((a, b) => key(b).localeCompare(key(a))) }));
  const rank = { custom: 0, category: 1, keyword: 2 };
  let out = groups.filter(g => g.kind === "custom" || g.chats.length).sort((a, b) => rank[a.kind] - rank[b.kind] || (a.kind === "custom" ? 0 : b.chats.length - a.chats.length || a.name.localeCompare(b.name)));
  if (S.topic) out = out.filter(g => g.key === S.topic);
  else {
    const covered = new Set(); groups.filter(g => g.kind !== "keyword").forEach(g => g.chats.forEach(c => covered.add(c.id)));
    const rest = S.chats.filter(c => ok(c.id) && !covered.has(c.id)).sort((a, b) => key(b).localeCompare(key(a)));
    if (rest.length) out.push({ key: "none", kind: "none", name: "Sem tema", chats: rest });
  }
  return out;
}
function renderTopicList() {
  const groups = topicGroups(); let html = "", lastKind = null;
  html += `<div class="topic-tools"><button class="btn ghost" data-act="new-topic">＋ Novo tema</button>${S.topic ? `<button class="btn ghost" data-act="clear-topic">Mostrar todos ✕</button>` : ""}</div>`;
  for (const g of groups) {
    if (g.kind !== lastKind && g.kind !== "none") { html += `<div class="group">${KIND_LABEL[g.kind]}</div>`; lastKind = g.kind; }
    const open = S.topic ? true : (g.key in S.open ? S.open[g.key] : g.kind !== "keyword");
    const label = g.kind === "keyword" ? "#" + g.name : g.name;
    html += `<div class="tgroup${open ? " open" : ""}" data-key="${esc(g.key)}">
      <div class="tg-head"><button class="tg-toggle" data-act="toggle" data-key="${esc(g.key)}"><span class="caret"></span><span class="tg-name">${esc(label)}</span><span class="tg-count">${g.chats.length}</span></button>
      ${g.kind === "custom" ? `<button class="icon-btn sm" data-act="edit-topic" data-key="${esc(g.key)}" title="Editar tema">✎</button>` : ""}</div>
      ${open ? `<div class="tg-body">${g.chats.length ? g.chats.map(c => itemHtml(c)).join("") : `<div class="empty-list sm">Nenhum chat neste tema ainda. Edite para adicionar palavras ou chats.</div>`}</div>` : ""}</div>`;
  }
  if (!groups.length || (groups.length === 1 && !groups[0].chats.length && groups[0].kind !== "custom")) html += `<div class="empty-list">Nenhum tema detectado.</div>`;
  return html;
}

function renderList() {
  const el = $("#list"); let html = "";
  const bySearch = S.search ? new Map(S.search.map(r => [r.id, r])) : null;
  const byTopic = S.view === "topics" && !bySearch;
  document.querySelectorAll("#seg button").forEach(b => b.classList.toggle("on", b.dataset.v === S.view));
  $("#sortBtn").style.display = byTopic ? "none" : "";
  if (byTopic) html = renderTopicList();
  else {
    const list = visibleChats(); let last = null;
    for (const c of list) {
      if (!bySearch && S.sort === "recent") { const g = groupLabel(c); if (g !== last) { html += `<div class="group">${esc(g)}</div>`; last = g; } }
      html += itemHtml(c, bySearch && bySearch.get(c.id));
    }
    if (!list.length) html = `<div class="empty-list">${S.search ? "Nenhum chat encontrado." : S.filter === "pinned" ? "Nenhum chat fixado." : "Nenhum chat carregado."}</div>`;
  }
  const y = el.scrollTop; el.innerHTML = html; el.scrollTop = y;
  const total = S.chats.reduce((n, c) => n + c.message_count, 0);
  $("#stats").textContent = `${plural(S.chats.length, "chat", "chats")} · ${plural(total, "mensagem", "mensagens")}`;
}

/* ---- temas do chat aberto (chips no cabeçalho) ---- */
function topicChips(id) {
  if (!S.topics) return "";
  const keys = S.topics.chat_topics[id] || []; const kws = (S.topics.chat_keywords[id] || []).slice(0, 5);
  const chip = (k, label, cls) => `<button class="tchip ${cls}" data-act="goto-topic" data-key="${esc(k)}" title="Ver todos os chats deste tema">${esc(label)}</button>`;
  return keys.map(k => { const g = S.tmap.get(k); return g ? chip(k, g.name, g.kind) : ""; }).join("") +
    kws.map(w => S.tmap.has("kw:" + w) ? chip("kw:" + w, "#" + w, "keyword") : `<span class="tchip plain">#${esc(w)}</span>`).join("");
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
      <div class="chat-meta">${esc(fmtDT(c.inserted_at))} · ${plural(path.length, "mensagem", "mensagens")} (${plural(nUser, "pergunta", "perguntas")})${flags.length ? " · " + esc(flags.join(", ")) : ""}</div>
      <div class="tchips">${topicChips(c.id)}<button class="tchip add" data-act="edit-chat-topics" title="Adicionar este chat a um dos seus temas">＋ tema</button></div></div>
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
  await loadTopics(false);
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

async function loadTopics(rerender = true) {
  try { S.topics = await api("/api/topics"); } catch { S.topics = { groups: [], chat_topics: {}, chat_keywords: {} }; }
  S.tmap = new Map(S.topics.groups.map(g => [g.key, g]));
  if (S.topic && !S.tmap.has(S.topic)) S.topic = null;
  if (rerender) { renderList(); if (S.chat) { const y = $("#main").scrollTop; renderChat(false); $("#main").scrollTop = y; } }
}

/* ---- temas personalizados: modal de criar/editar ---- */
const customList = () => (S.topics?.groups || []).filter(g => g.kind === "custom").map(g => ({ id: g.custom.id, name: g.name, keywords: g.custom.keywords, chats: g.custom.chats }));
async function saveCustom(list) {
  await api("/api/custom", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topics: list }) });
  await loadTopics();
}
function openTopicDialog(key) {
  const g = key ? S.tmap.get(key) : null; const cu = g ? g.custom : { id: null, keywords: [], chats: [] };
  const dlg = $("#dlg"); const chosen = new Set(cu.chats);
  dlg.innerHTML = `<form method="dialog" class="dlg-in" id="dlgForm">
    <h2>${g ? "Editar tema" : "Novo tema"}</h2>
    <label>Nome<input id="tName" maxlength="60" value="${esc(g ? g.name : "")}" placeholder="Ex.: Meu TCC, Receitas da família, Projeto X" required></label>
    <label>Palavras que definem o tema <small>(separe por vírgula; o chat entra no tema se contiver qualquer uma delas)</small>
      <input id="tKw" value="${esc(cu.keywords.join(", "))}" placeholder="Ex.: tcc, monografia, orientador"></label>
    <div class="dlg-sub">Ou escolha chats manualmente</div>
    <input id="tFilter" class="dlg-filter" placeholder="Filtrar chats…" type="search">
    <div class="dlg-list" id="tChats">${S.chats.map(c => `<label class="dlg-row" data-t="${esc(fold(c.title))}"><input type="checkbox" value="${esc(c.id)}" ${chosen.has(c.id) ? "checked" : ""}><span>${esc(c.title)}</span></label>`).join("")}</div>
    <div class="dlg-actions">${g ? `<button type="button" class="btn ghost danger" id="tDel">Excluir tema</button>` : ""}<span class="spacer"></span>
      <button type="button" class="btn ghost" id="tCancel">Cancelar</button><button class="btn" id="tSave" value="ok">Salvar</button></div></form>`;
  dlg.showModal();
  $("#tName").focus();
  $("#tFilter").addEventListener("input", e => { const q = fold(e.target.value); dlg.querySelectorAll(".dlg-row").forEach(r => r.style.display = r.dataset.t.includes(q) ? "" : "none"); });
  $("#tCancel").onclick = () => dlg.close();
  if (g) $("#tDel").onclick = async () => { if (!confirm(`Excluir o tema "${g.name}"? Os chats não são apagados.`)) return; try { await saveCustom(customList().filter(t => t.id !== cu.id)); if (S.topic === key) S.topic = null; renderList(); dlg.close(); toast("Tema excluído"); } catch (er) { toast(er.message); } };
  $("#dlgForm").addEventListener("submit", async e => {
    e.preventDefault();
    const name = $("#tName").value.trim(); if (!name) return;
    const item = {
      id: cu.id, name, keywords: $("#tKw").value.split(",").map(s => s.trim()).filter(Boolean),
      chats: [...dlg.querySelectorAll("#tChats input:checked")].map(i => i.value),
    };
    const list = customList(); const i = list.findIndex(t => t.id === cu.id);
    if (i >= 0) list[i] = item; else list.push(item);
    try { await saveCustom(list); S.view = "topics"; store.set("ds_view", "topics"); renderList(); dlg.close(); toast("Tema salvo"); } catch (er) { toast(er.message); }
  });
}
/* menu rápido "＋ tema" do cabeçalho: marca/desmarca o chat aberto em cada tema personalizado */
function openChatTopicsDialog() {
  const custom = customList(); const id = S.currentId; const dlg = $("#dlg");
  if (!custom.length) { openTopicDialog(null); return; }
  dlg.innerHTML = `<form method="dialog" class="dlg-in"><h2>Temas deste chat</h2>
    <div class="dlg-list tall">${custom.map(t => `<label class="dlg-row"><input type="checkbox" value="${esc(t.id)}" ${t.chats.includes(id) ? "checked" : ""}><span>${esc(t.name)}</span></label>`).join("")}</div>
    <p class="dlg-hint">Chats também entram automaticamente num tema pelas palavras dele.</p>
    <div class="dlg-actions"><button type="button" class="btn ghost" id="tNew">＋ Novo tema</button><span class="spacer"></span><button type="button" class="btn ghost" id="tCancel">Cancelar</button><button class="btn" value="ok">Salvar</button></div></form>`;
  dlg.showModal();
  $("#tCancel").onclick = () => dlg.close();
  $("#tNew").onclick = () => { dlg.close(); openTopicDialog(null); };
  dlg.querySelector("form").addEventListener("submit", async e => {
    e.preventDefault();
    const on = new Set([...dlg.querySelectorAll("input:checked")].map(i => i.value));
    const list = customList().map(t => ({ ...t, chats: on.has(t.id) ? [...new Set([...t.chats, id])] : t.chats.filter(c => c !== id) }));
    try { await saveCustom(list); dlg.close(); toast("Temas atualizados"); } catch (er) { toast(er.message); }
  });
}

/* ============================ eventos ============================ */
document.addEventListener("click", e => {
  const t = e.target;
  const seg = t.closest("#seg button");
  if (seg) { S.view = seg.dataset.v; store.set("ds_view", S.view); if (S.view === "date") S.topic = null; return renderList(); }
  const act = t.closest("[data-act]");
  if (act) {
    const a = act.dataset.act, k = act.dataset.key;
    if (a === "toggle") { const cur = S.tmap.get(k); const isOpen = k in S.open ? S.open[k] : cur?.kind !== "keyword"; S.open[k] = !isOpen; return renderList(); }
    if (a === "new-topic") return openTopicDialog(null);
    if (a === "edit-topic") return openTopicDialog(k);
    if (a === "clear-topic") { S.topic = null; return renderList(); }
    if (a === "goto-topic") { S.view = "topics"; store.set("ds_view", "topics"); S.topic = k; S.search = null; $("#q").value = ""; S.q = ""; renderList(); document.body.classList.add("nav"); return; }
    if (a === "edit-chat-topics") return openChatTopicsDialog();
  }
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
