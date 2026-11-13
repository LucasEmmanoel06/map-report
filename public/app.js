/* global L */
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTR = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const RECIFE = [-8.0631, -34.8711];
const LEVEL = {
  atendido: { rotulo: 'ATENDIDO', simbolo: '✔', tag: '✓' },
  alta: { rotulo: 'ALTA', simbolo: '▲', tag: '!' },
  media: { rotulo: 'MÉDIA', simbolo: '◆', tag: '•' },
  baixa: { rotulo: 'BAIXA', simbolo: '●', tag: '–' },
};
const STATUS = { aberta: 'Aguardando análise', em_analise: 'Em análise pela prefeitura', resolvida: 'Atendido pela prefeitura' };

const CAT_ICON = { encosta: 'mountain', muro: 'brick-wall', canal_lixo: 'trash-2', bueiro: 'circle-dot', alagamento: 'waves', erosao: 'construction', arvore: 'tree-pine', mangue: 'leaf', outro: 'triangle-alert' };
const icons = () => window.lucide?.createIcons();
const ico = (name, cls = 'h-5 w-5') => el('i', { 'data-lucide': name, class: cls, 'aria-hidden': 'true' });
const $ = (s) => document.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) n.append(kid instanceof Node ? kid : document.createTextNode(kid ?? ''));
  return n;
};
const safe = (fn) => { try { return fn(); } catch { return null; } };

const clientId = safe(() => localStorage.getItem('cid')) || (() => {
  // randomUUID só existe em HTTPS/localhost; em http://IP-da-rede (testes no celular) usa alternativa.
  const id = crypto.randomUUID?.() || `${Date.now().toString(36)}-${Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('')}`;
  safe(() => localStorage.setItem('cid', id));
  return id;
})();

let categories = [];
let reports = [];
let filter = 'todas';
let selectedId = null;
let view = 'mapa'; // 'mapa' | 'lista'
let mineOnly = false;
let riskAreas = [];
const markers = new Map();

// "Minhas denúncias": guardadas neste aparelho (id -> última situação vista), sem login.
const mine = safe(() => JSON.parse(localStorage.getItem('meus') || '{}')) || {};
const saveMine = () => safe(() => localStorage.setItem('meus', JSON.stringify(mine)));
const fmt = (n) => Number(n).toLocaleString('pt-BR');

/* ---------- API ---------- */
async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', 'x-client-id': clientId, ...(opts.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.erro || 'Algo deu errado. Tente de novo.');
  return data;
}
const cat = (id) => categories.find((c) => c.id === id) || { icone: '⚠️', curto: 'Risco', nome: 'Risco' };
const ago = (iso) => {
  const h = (Date.now() - new Date(iso)) / 3600_000;
  if (h < 1) return 'há poucos minutos';
  if (h < 24) return `há ${Math.floor(h)} h`;
  return `há ${Math.floor(h / 24)} dia(s)`;
};
const place = (r) => [r.rua, r.bairro].filter(Boolean).join(', ') || 'Região Metropolitana do Recife';
// "Atendido" = a prefeitura já resolveu o caso; passa a ser o nível exibido, mesmo que a prioridade original tenha sido alta/média/baixa.
const nivel = (r) => (r.status === 'resolvida' ? 'atendido' : r.prioridade);
const badge = (p) => el('span', { class: `badge badge-${p}` }, p === 'atendido' ? '✔ Atendido pela prefeitura' : `${LEVEL[p].simbolo} Prioridade ${LEVEL[p].rotulo}`);
const ICON_OF = (id) => CAT_ICON[id] || 'triangle-alert';
const ORDER = { alta: 0, media: 1, baixa: 2, atendido: 3 };

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 7000);
}

// Dados oficiais da Defesa Civil do Recife que acompanham cada ponto.
function officialBox(r) {
  const ctx = r.contexto_oficial;
  if (!ctx || (!ctx.area && !ctx.bairro)) return '';
  const items = [];
  if (ctx.area) items.push(el('li', {}, `Fica a ${ctx.area.distancia_m} m de uma ${ctx.area.tipo.toLowerCase()} mapeada pela Defesa Civil (${ctx.area.localidade}).`));
  if (ctx.bairro) items.push(el('li', {}, `Em ${ctx.bairro.ano}, a Defesa Civil fez ${fmt(ctx.bairro.atendimentos)} atendimentos em ${r.bairro || ctx.bairro.nome}` + (ctx.bairro.risco_alto ? `, com ${fmt(ctx.bairro.risco_alto)} imóveis em risco alto.` : '.')));
  return el('div', { class: 'box' }, el('strong', {}, ico('landmark', 'h-5 w-5'), 'Dados oficiais do Recife'), el('ul', { class: 'ml-5 list-disc' }, items),
    el('span', { class: 'mt-1 block text-xs text-slate-600' }, 'Fonte: Portal de Dados Abertos do Recife – Defesa Civil.'));
}
const whoBox = (r) => el('div', { class: 'box' }, el('strong', {}, ico('building-2', 'h-5 w-5'), 'Quem resolve'), cat(r.categoria).orgao || 'Defesa Civil do Recife',
  r.encaminhado_em ? el('em', { class: 'mt-1 flex items-center gap-1 font-bold not-italic text-baixa' }, ico('send', 'h-4 w-4'), 'Já encaminhado pela Defesa Civil') : '');

/* ---------- Mapa principal ---------- */
const map = L.map('mapa', { zoomControl: true }).setView(RECIFE, 12);
L.tileLayer(TILES, { maxZoom: 19, attribution: ATTR }).addTo(map);

/* ---------- Camada oficial: áreas de risco mapeadas pela Defesa Civil (desligada por padrão) ---------- */
const riskLayer = L.layerGroup();
const miniRiskLayer = L.layerGroup();
const RiskControl = L.Control.extend({
  onAdd() {
    const b = L.DomUtil.create('button', 'risk-toggle');
    b.type = 'button';
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = '<span class="risk-dot" aria-hidden="true"></span> Áreas de risco oficiais';
    b.title = 'Mostrar ou esconder as áreas de risco mapeadas pela Defesa Civil do Recife';
    L.DomEvent.disableClickPropagation(b);
    L.DomEvent.on(b, 'click', () => {
      const on = !map.hasLayer(riskLayer);
      if (on) riskLayer.addTo(map); else riskLayer.remove();
      b.setAttribute('aria-pressed', String(on));
    });
    return b;
  },
});
new RiskControl({ position: 'topright' }).addTo(map);

async function loadRiskAreas() {
  const data = await api('/api/risk-areas');
  riskAreas = data.pontos.map(([lat, lng, nivel, localidade, tipo]) => ({ lat, lng, nivel, localidade, tipo }));
  for (const p of riskAreas) {
    L.circleMarker([p.lat, p.lng], { radius: p.nivel >= 4 ? 7 : 5, color: '#6d28d9', weight: 1.5, fillColor: '#8b5cf6', fillOpacity: 0.35 })
      .bindTooltip(`${p.tipo} · ${p.localidade} (Defesa Civil)`)
      .addTo(riskLayer);
    L.circleMarker([p.lat, p.lng], { radius: 4, color: '#6d28d9', weight: 1, fillOpacity: 0.3, interactive: false }).addTo(miniRiskLayer);
  }
}

function nearestRisk(lat, lng, maxM = 150) {
  let best = null;
  for (const p of riskAreas) {
    const d = dist({ lat, lng }, p);
    if (d <= maxM && (!best || d < best.d)) best = { ...p, d: Math.round(d) };
  }
  return best;
}

function pinIcon(r) {
  const c = cat(r.categoria);
  const html = `<div class="pin pin-${nivel(r)}"><i data-lucide="${ICON_OF(r.categoria)}" aria-hidden="true"></i><span class="pin-tag" aria-hidden="true">${LEVEL[nivel(r)].tag}</span></div>`;
  return L.divIcon({ html, className: 'pin-wrap', iconSize: [46, 46], iconAnchor: [23, 23] });
}

function visible() {
  return reports.filter((r) => filter === 'todas' || nivel(r) === filter);
}

function renderMap() {
  for (const m of markers.values()) m.remove();
  markers.clear();
  for (const r of visible()) {
    const c = cat(r.categoria);
    const m = L.marker([r.lat, r.lng], { icon: pinIcon(r), title: `${c.curto}, ${nivel(r) === 'atendido' ? 'atendido' : 'prioridade ' + LEVEL[r.prioridade].rotulo}`, alt: `${c.curto}, ${nivel(r) === 'atendido' ? 'atendido' : 'prioridade ' + LEVEL[r.prioridade].rotulo}`, keyboard: true }).addTo(map);
    m.on('click', () => openSheet(r.id));
    markers.set(r.id, m);
  }
  icons();
}

/* ---------- Lista (alternativa acessível ao mapa) ---------- */
function listItems() {
  return visible()
    .filter((r) => !mineOnly || mine[r.id] !== undefined)
    .sort((a, b) => ORDER[nivel(a)] - ORDER[nivel(b)] || b.confirmacoes - a.confirmacoes || new Date(b.criado_em) - new Date(a.criado_em));
}

function renderList() {
  const items = listItems();
  $('#lista-title').textContent = mineOnly ? 'Minhas solicitações' : 'Problemas denunciados';
  $('#lista-hint').textContent = mineOnly ? 'Denúncias enviadas deste aparelho. Veja se a prefeitura já está cuidando.' : `${items.length} ${items.length === 1 ? 'ponto' : 'pontos'}. Os mais urgentes aparecem primeiro.`;
  const empty = el('li', { class: 'rounded-2xl border-2 border-dashed border-slate-300 bg-white p-5 text-center' },
    mineOnly ? 'Você ainda não enviou denúncias deste aparelho. Toque em "Denunciar um problema" para começar.' : 'Nenhum ponto com este filtro.');
  $('#lista-itens').replaceChildren(...(items.length ? items.map((r) => {
    const c = cat(r.categoria);
    return el('li', {}, el('button', { type: 'button', class: 'flex w-full items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm hover:border-brand-600', onclick: () => openSheet(r.id) },
      el('span', { class: `pin pin-${nivel(r)} !h-11 !w-11 shrink-0` }, ico(ICON_OF(r.categoria))),
      el('span', { class: 'grid min-w-0 flex-1 gap-1' },
        el('span', { class: 'font-extrabold leading-tight' }, c.nome),
        el('span', { class: 'flex flex-wrap items-center gap-1.5' }, badge(nivel(r)), r.ficticio ? el('span', { class: 'fake' }, 'Exemplo fictício') : '', r.contexto_oficial?.area ? el('span', { class: 'official' }, 'Área de risco oficial') : ''),
        el('span', { class: 'text-sm text-slate-600' }, `${place(r)} · ${ago(r.criado_em)} · ${STATUS[r.status]} · ${r.confirmacoes} confirmações`))));
  }) : [empty]));
  icons();
}

function setView(v, { onlyMine = false } = {}) {
  view = v;
  mineOnly = v === 'lista' && onlyMine;
  $('#lista').hidden = v !== 'lista';
  const b = $('#btn-view');
  b.setAttribute('aria-pressed', String(v === 'lista'));
  b.replaceChildren(ico(v === 'lista' ? 'map' : 'list', 'h-5 w-5'), v === 'lista' ? 'Ver mapa' : 'Ver lista');
  icons();
  if (v === 'lista') { renderList(); $('#lista-title').focus(); } else map.invalidateSize();
}

function updateMineButton() {
  const n = Object.keys(mine).length;
  const mineLabel = n ? `Minhas solicitações (${n})` : 'Minhas solicitações';
  $('#mine-count').textContent = mineLabel;
  $('#btn-mine').setAttribute('aria-label', mineLabel);
  $('#btn-mine').title = mineLabel; // no desktop o botão é só ícone: o texto aparece ao passar o mouse
}

// Avisa quando a situação de uma denúncia minha mudou desde a última visita.
function checkMineUpdates() {
  const changed = [];
  for (const r of reports) {
    if (mine[r.id] !== undefined && mine[r.id] !== r.status) { changed.push(r); mine[r.id] = r.status; }
  }
  saveMine();
  if (changed.length) toast(`Novidade: sua denúncia de ${cat(changed[0].categoria).curto.toLowerCase()} agora está "${STATUS[changed[0].status]}".`);
}

function render() {
  renderMap();
  if (view === 'lista') renderList();
}

async function refresh() {
  reports = await api('/api/reports');
  render();
  checkMineUpdates();
  updateMineButton();
  const s = await api('/api/stats');
  const pct = s.alta_com_acao_pct;
  $('#stats-text').textContent = `${s.total} pontos no mapa · ${s.alta} de prioridade alta` + (pct === null ? '' : ` · ${pct}% dos urgentes já têm ação`);
}

/* ---------- Detalhes ---------- */
function speak(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'pt-BR';
  speechSynthesis.speak(u);
}

function openSheet(id) {
  const r = reports.find((x) => x.id === id);
  if (!r) return;
  selectedId = id;
  const c = cat(r.categoria);
  const speech = `${c.nome}. ${nivel(r) === 'atendido' ? 'Caso atendido pela prefeitura.' : 'Prioridade ' + LEVEL[r.prioridade].rotulo + '.'} ${r.motivo} ${r.orientacao}`;
  const body = $('#sheet-body');
  const status = r.revisada_por_humano
    ? el('em', { class: 'mt-1 flex items-center gap-1 text-baixa not-italic font-bold' }, ico('shield-check', 'h-4 w-4'), 'Conferida pela Defesa Civil')
    : el('em', { class: 'mt-1 block text-sm text-slate-600' }, r.fonte_prioridade === 'ia' ? 'Sugerida por inteligência artificial, aguardando conferência humana.' : 'Calculada por regras de segurança, aguardando conferência humana.');
  body.replaceChildren(
    el('h2', { id: 'sheet-title', class: 'flex items-center gap-2 pr-2 pt-1 text-xl font-extrabold leading-tight' }, ico(ICON_OF(r.categoria), 'h-6 w-6 shrink-0 text-brand-600'), c.nome),
    el('p', { class: 'mt-2 flex flex-wrap items-center gap-2' }, badge(nivel(r)), nivel(r) === 'atendido' ? el('span', { class: 'text-xs font-semibold text-slate-600' }, `Era prioridade ${LEVEL[r.prioridade].rotulo}`) : '', r.ficticio ? el('span', { class: 'fake' }, 'Exemplo fictício') : ''),
    r.foto_url ? el('img', { class: 'mt-3 max-h-56 w-full rounded-2xl bg-slate-100 object-cover', src: r.foto_url, alt: `Foto enviada: ${c.curto}`, loading: 'lazy' }) : '',
    el('p', { class: 'mt-3 text-base' }, r.descricao),
    el('p', { class: 'hint flex items-start gap-1.5' }, ico('map-pin', 'mt-0.5 h-4 w-4 shrink-0'), `${place(r)} · ${ago(r.criado_em)} · ${STATUS[r.status]}`),
    el('div', { class: 'box' }, el('strong', {}, ico('brain-circuit', 'h-5 w-5'), 'Por que essa prioridade?'), r.motivo, status),
    el('div', { class: 'box' }, el('strong', {}, ico('life-buoy', 'h-5 w-5'), 'O que fazer agora'), r.orientacao),
    officialBox(r),
    whoBox(r),
    el('div', { class: 'mt-3 grid gap-2 sm:grid-cols-2' },
      el('button', { type: 'button', class: 'btn btn-primary', id: 'btn-confirm', onclick: () => confirmReport(r.id) }, ico('eye', 'h-5 w-5'), `Também vi isso aqui (${r.confirmacoes})`),
      el('button', { type: 'button', class: 'btn btn-secondary', onclick: () => speak(speech) }, ico('volume-2', 'h-5 w-5'), 'Ouvir'),
    ),
    el('p', { class: 'hint' }, 'Perigo agora? Saia do local e ligue ', el('a', { href: 'tel:199', class: 'font-extrabold underline' }, '199'), ' (Defesa Civil).'),
  );
  icons();
  $('#sheet').hidden = false;
  $('#sheet-close').focus();
  map.panTo([r.lat, r.lng]);
}

function closeSheet() {
  $('#sheet').hidden = true;
  speechSynthesis?.cancel?.();
  const m = markers.get(selectedId);
  m?.getElement()?.focus();
}

async function confirmReport(id) {
  const btn = $('#btn-confirm');
  btn.disabled = true;
  try {
    const updated = await api(`/api/reports/${id}/confirm`, { method: 'POST' });
    reports = reports.map((r) => (r.id === id ? updated : r));
    openSheet(id);
    $('#btn-confirm').replaceChildren(ico('check', 'h-5 w-5'), 'Obrigado! Confirmação registrada'); icons();
  } catch (e) {
    btn.disabled = false;
    alert(e.message);
  }
}

/* ---------- Assistente de denúncia ---------- */
const wiz = { step: 1, categoria: null, lat: null, lng: null, foto: null, mini: null, pin: null };
const TOTAL = 3;

function buildCategories() {
  const grid = $('#cat-grid');
  grid.replaceChildren(...categories.map((c) => el('button', { type: 'button', class: 'cat', role: 'radio', 'aria-checked': 'false', 'data-id': c.id, onclick: () => pickCategory(c.id) },
    el('span', { class: 'ico' }, ico(ICON_OF(c.id), 'h-7 w-7')), c.curto)));
  icons();
}

function pickCategory(id) {
  wiz.categoria = id;
  document.querySelectorAll('.cat').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.id === id)));
  showError('');
}

function showError(msg) {
  const e = $('#wiz-error');
  e.textContent = msg;
  e.hidden = !msg;
}

function setPin(lat, lng) {
  wiz.lat = lat; wiz.lng = lng;
  if (wiz.pin) wiz.pin.setLatLng([lat, lng]);
  else {
    wiz.pin = L.marker([lat, lng], { draggable: true, title: 'Local do problema' }).addTo(wiz.mini);
    wiz.pin.on('dragend', () => { const p = wiz.pin.getLatLng(); setPin(p.lat, p.lng); });
  }
  $('#loc-status').textContent = '✔ Local marcado. Você pode arrastar o alfinete para ajustar.';
  const risk = nearestRisk(lat, lng);
  const box = $('#loc-risk');
  box.hidden = !risk;
  if (risk) box.replaceChildren(ico('triangle-alert', 'mt-0.5 h-5 w-5 shrink-0'), el('span', {}, el('strong', {}, 'Atenção: '), `este lugar fica a ${risk.d} m de uma ${risk.tipo.toLowerCase()} mapeada pela Defesa Civil (${risk.localidade}). Se houver perigo agora, saia do local e ligue 199.`));
  icons();
}

function ensureMini() {
  if (!wiz.mini) {
    wiz.mini = L.map('mini-mapa').setView(RECIFE, 13);
    L.tileLayer(TILES, { maxZoom: 19, attribution: ATTR }).addTo(wiz.mini);
    wiz.mini.on('click', (e) => setPin(e.latlng.lat, e.latlng.lng));
  }
  // O mapa do formulário segue a escolha feita no mapa principal.
  if (map.hasLayer(riskLayer)) miniRiskLayer.addTo(wiz.mini); else miniRiskLayer.remove();
  setTimeout(() => wiz.mini.invalidateSize(), 50);
}

function locate() {
  const status = $('#loc-status');
  if (!navigator.geolocation) { status.textContent = 'Seu aparelho não permite localização. Toque no mapa para marcar.'; return; }
  status.textContent = 'Procurando você…';
  navigator.geolocation.getCurrentPosition(
    (pos) => { setPin(pos.coords.latitude, pos.coords.longitude); wiz.mini.setView([pos.coords.latitude, pos.coords.longitude], 17); },
    () => { status.textContent = 'Não consegui pegar sua localização. Toque no mapa para marcar o lugar.'; },
    { enableHighAccuracy: true, timeout: 10000 },
  );
}

const dist = (a, b) => Math.hypot((a.lat - b.lat) * 111_000, (a.lng - b.lng) * 111_000 * Math.cos((a.lat * Math.PI) / 180));

function showDuplicate() {
  const box = $('#dup');
  const near = reports.find((r) => r.categoria === wiz.categoria && r.status !== 'resolvida' && dist(r, wiz) < 60);
  if (!near) { box.hidden = true; return; }
  box.hidden = false;
  box.replaceChildren(
    el('strong', {}, 'Já existe uma denúncia parecida aqui.'), ' Se é o mesmo problema, é melhor confirmar a que já existe.',
    el('div', { class: 'mt-3 grid gap-2' }, el('button', { type: 'button', class: 'btn btn-primary', onclick: async () => {
        try {
          const updated = await api(`/api/reports/${near.id}/confirm`, { method: 'POST' });
          reports = reports.map((r) => (r.id === near.id ? updated : r));
        } catch { /* segue para abrir a denúncia mesmo assim */ }
        $('#wizard').close();
        openSheet(near.id);
      } }, 'É o mesmo: confirmar'),
      el('button', { type: 'button', class: 'btn btn-secondary', onclick: () => { box.hidden = true; } }, 'É outro problema')),
  );
}

function goStep(n) {
  wiz.step = n;
  document.querySelectorAll('#wiz-form section[data-step]').forEach((s) => { s.hidden = Number(s.dataset.step) !== n; });
  $('#wiz-step').textContent = n <= TOTAL ? `Passo ${n} de ${TOTAL}` : 'Pronto!';
  $('#wiz-back').hidden = n === 1 || n > TOTAL;
  $('#wiz-next').hidden = false;
  $('#wiz-next').replaceChildren(...(n === TOTAL ? [ico('send', 'h-5 w-5'), 'Enviar denúncia'] : n > TOTAL ? [ico('map', 'h-5 w-5'), 'Ver no mapa'] : ['Continuar', ico('arrow-right', 'h-5 w-5')]));
  document.querySelectorAll('#wiz-bars span').forEach((b, i) => { b.className = `h-2 flex-1 rounded-full ${i < Math.min(n, TOTAL) ? 'bg-brand-600' : 'bg-slate-200'}`; });
  icons();
  showError('');
  if (n === 2) ensureMini();
  if (n === 3) showDuplicate();
  const heading = document.querySelector(`#wiz-form section[data-step="${n}"] h3`);
  heading?.setAttribute('tabindex', '-1');
  heading?.focus();
}

async function compress(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.72);
}

async function next() {
  showError('');
  if (wiz.step === 1) {
    if (!wiz.categoria) return showError('Escolha o tipo de problema para continuar.');
    return goStep(2);
  }
  if (wiz.step === 2) {
    if (wiz.lat == null) return showError('Marque o local: use sua localização ou toque no mapa.');
    return goStep(3);
  }
  if (wiz.step === 3) {
    const desc = $('#desc').value.trim();
    if (!wiz.foto) return showError('Envie pelo menos uma foto do problema.');
    if (rec.recorder?.state === 'recording') await stopRec(); // tocou em Enviar ainda gravando
    if (desc.length < 10 && !rec.audio) return showError('Conte em poucas palavras o que você viu (mínimo 10 letras) ou grave um áudio.');
    return submit(desc);
  }
  $('#wizard').close();
  if (view === 'lista') setView('mapa');
  map.setView([wiz.lat, wiz.lng], 16);
}

async function submit(desc) {
  const result = $('#result');
  document.querySelectorAll('#wiz-form section[data-step]').forEach((s) => { s.hidden = s !== result; });
  $('#wiz-next').hidden = true; $('#wiz-back').hidden = true;
  result.replaceChildren(el('div', { class: 'grid place-items-center gap-3 py-12 text-center font-bold' }, el('div', { class: 'spinner h-12 w-12 rounded-full border-4 border-slate-200 border-t-brand-600' }), rec.audio ? 'Transcrevendo seu áudio e analisando a foto com inteligência artificial…' : 'Analisando a foto com inteligência artificial…'));
  const sentAudio = Boolean(rec.audio);
  try {
    const r = await api('/api/reports', { method: 'POST', body: JSON.stringify({ categoria: wiz.categoria, descricao: desc, lat: wiz.lat, lng: wiz.lng, foto: wiz.foto, audio: rec.audio || undefined }) });
    resetRec();
    reports = [r, ...reports];
    mine[r.id] = r.status;
    saveMine();
    updateMineButton();
    render();
    refresh().catch(() => {});
    result.replaceChildren(
      el('div', { class: 'grid place-items-center py-2 text-center' }, el('span', { class: 'mb-2 grid h-16 w-16 place-items-center rounded-full bg-baixa-bg text-baixa' }, ico('check-circle-2', 'h-9 w-9')), el('h3', { class: 'text-2xl font-extrabold' }, 'Denúncia enviada. Obrigado!'), el('p', { class: 'hint' }, 'A prefeitura já pode ver este ponto no mapa.')),
      el('p', { class: 'text-center' }, badge(r.prioridade)),
      r.foto_coerente ? '' : el('p', { class: 'notice' }, 'A foto parece não mostrar o problema descrito. A Defesa Civil vai conferir.'),
      r.descricao_por_audio ? el('div', { class: 'box' }, el('strong', {}, ico('audio-lines', 'h-5 w-5'), 'O que entendemos do seu áudio'), r.descricao) : '',
      sentAudio && !r.descricao_por_audio ? el('p', { class: 'notice' }, 'Não consegui transcrever o áudio, então usamos só o texto que você escreveu.') : '',
      el('div', { class: 'box' }, el('strong', {}, ico('brain-circuit', 'h-5 w-5'), 'Por que essa prioridade?'), r.motivo),
      el('div', { class: 'box' }, el('strong', {}, ico('life-buoy', 'h-5 w-5'), 'O que fazer agora'), r.orientacao),
      officialBox(r),
      whoBox(r),
      el('p', { class: 'hint' }, 'Acompanhe em "Minhas solicitações": avisaremos aqui quando a prefeitura mudar a situação.'),
      el('button', { type: 'button', class: 'btn btn-secondary w-full', onclick: () => speak(`Denúncia enviada. Prioridade ${LEVEL[r.prioridade].rotulo}. ${r.motivo} ${r.orientacao}`) }, ico('volume-2', 'h-5 w-5'), 'Ouvir'),
    );
    wiz.lat = r.lat; wiz.lng = r.lng;
    goStep(4);
    result.hidden = false;
  } catch (e) {
    result.hidden = true;
    goStep(3);
    showError(e.message);
  }
}

function openWizard() {
  Object.assign(wiz, { step: 1, categoria: null, lat: null, lng: null, foto: null });
  resetRec();
  if (wiz.pin) { wiz.pin.remove(); wiz.pin = null; }
  $('#desc').value = ''; $('#desc-count').textContent = '0 de 500 letras (mínimo 10, ou grave um áudio)';
  $('#foto').value = ''; $('#foto-prev').hidden = true; $('#loc-status').textContent = '';
  document.querySelectorAll('.cat').forEach((b) => b.setAttribute('aria-checked', 'false'));
  $('#result').hidden = false;
  goStep(1);
  closeSheetQuiet();
  $('#wizard').showModal();
}
const closeSheetQuiet = () => { $('#sheet').hidden = true; };

/* ---------- Eventos ---------- */
$('#btn-new').addEventListener('click', openWizard);
$('#btn-view').addEventListener('click', () => setView(view === 'lista' ? 'mapa' : 'lista'));
$('#btn-mine').addEventListener('click', () => setView('lista', { onlyMine: !(view === 'lista' && mineOnly) }));
$('#wiz-next').addEventListener('click', next);
$('#wiz-back').addEventListener('click', () => goStep(wiz.step - 1));
$('#wiz-close').addEventListener('click', () => $('#wizard').close());
$('#btn-locate').addEventListener('click', locate);
$('#sheet-close').addEventListener('click', closeSheet);
$('#btn-help').addEventListener('click', () => $('#help').showModal());
$('#help-close').addEventListener('click', () => $('#help').close());
$('#wiz-form').addEventListener('submit', (e) => e.preventDefault());
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#sheet').hidden && !$('#wizard').open) closeSheet(); });

$('#desc').addEventListener('input', (e) => { $('#desc-count').textContent = `${e.target.value.length} de 500 letras (mínimo 10, ou grave um áudio)`; });
$('#foto').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    wiz.foto = await compress(file);
    const prev = $('#foto-prev');
    prev.src = wiz.foto; prev.alt = 'Foto escolhida por você'; prev.hidden = false;
    showError('');
  } catch { showError('Não consegui abrir essa foto. Tente outra.'); }
});

document.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => {
  filter = b.dataset.filter;
  document.querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  render();
}));

/* ---------- Áudio da descrição (vira texto no servidor, ao enviar) ---------- */
const MAX_REC_S = 60;
const REC_HINT = 'Fale o que está acontecendo (até 1 minuto). O áudio vira texto da descrição quando você enviar.';
const rec = { recorder: null, stream: null, chunks: [], timer: null, started: 0, audio: null, url: null, done: null };
const recStatus = (t) => { $('#rec-status').textContent = t; };
// Gravar exige microfone, MediaRecorder e endereço seguro (https ou localhost).
const canRecord = () => window.isSecureContext && !!navigator.mediaDevices?.getUserMedia && 'MediaRecorder' in window;
// Chrome/Android: webm/opus · Safari/iPhone: mp4/aac · Firefox: ogg/opus
const pickMime = () => ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
const blobToDataUrl = (blob) => new Promise((ok, fail) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = fail; fr.readAsDataURL(blob); });

function setRecUI(state) { // 'idle' | 'rec' | 'ready'
  const btn = $('#btn-rec');
  btn.hidden = state === 'ready';
  btn.setAttribute('aria-pressed', String(state === 'rec'));
  btn.classList.toggle('btn-rec-on', state === 'rec');
  btn.replaceChildren(ico(state === 'rec' ? 'square' : 'mic', 'h-6 w-6'), state === 'rec' ? 'Parar gravação' : 'Gravar áudio');
  $('#audio-ready').hidden = state !== 'ready';
  icons();
}

function releaseMic() {
  clearInterval(rec.timer);
  rec.stream?.getTracks().forEach((t) => t.stop());
  rec.stream = null;
}

async function startRec() {
  if (!canRecord()) return recStatus('A gravação de áudio não funciona neste navegador ou endereço (precisa de https). Escreva a descrição.');
  try {
    rec.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (e) {
    return recStatus(e.name === 'NotAllowedError'
      ? 'Você não deu permissão para o microfone. Para liberar, toque no cadeado ao lado do endereço do site. Ou escreva a descrição.'
      : 'Não consegui usar o microfone. Escreva a descrição.');
  }
  const mime = pickMime();
  rec.recorder = new MediaRecorder(rec.stream, { ...(mime && { mimeType: mime }), audioBitsPerSecond: 32000 });
  rec.chunks = [];
  rec.done = new Promise((resolve) => {
    rec.recorder.ondataavailable = (e) => { if (e.data.size) rec.chunks.push(e.data); };
    rec.recorder.onstop = async () => {
      releaseMic();
      const secs = Math.round((Date.now() - rec.started) / 1000);
      const type = (rec.recorder.mimeType || mime || 'audio/webm').replace(/^video\//, 'audio/');
      const blob = new Blob(rec.chunks, { type });
      if (secs < 1 || blob.size < 1000) {
        setRecUI('idle');
        recStatus('O áudio ficou curto demais. Toque em Gravar áudio e fale por alguns segundos.');
      } else {
        rec.audio = await blobToDataUrl(blob);
        rec.url = URL.createObjectURL(blob);
        $('#audio-prev').src = rec.url;
        setRecUI('ready');
        recStatus(`Áudio gravado (${secs}s). Ele vira texto da descrição quando você enviar.`);
      }
      resolve();
    };
  });
  rec.recorder.start(1000);
  rec.started = Date.now();
  setRecUI('rec');
  recStatus(`Gravando… 0s de ${MAX_REC_S}s. Toque em Parar gravação quando terminar.`);
  rec.timer = setInterval(() => {
    const s = Math.floor((Date.now() - rec.started) / 1000);
    recStatus(`Gravando… ${s}s de ${MAX_REC_S}s. Toque em Parar gravação quando terminar.`);
    if (s >= MAX_REC_S) stopRec();
  }, 1000);
}

function stopRec() {
  if (rec.recorder?.state === 'recording') rec.recorder.stop();
  return rec.done || Promise.resolve();
}

// Descarta o áudio e solta o microfone (ao apagar, abrir de novo ou fechar o formulário).
function resetRec() {
  if (rec.recorder?.state === 'recording') { rec.recorder.onstop = null; rec.recorder.stop(); }
  releaseMic();
  if (rec.url) URL.revokeObjectURL(rec.url);
  Object.assign(rec, { recorder: null, chunks: [], audio: null, url: null, done: null });
  $('#audio-prev').removeAttribute('src');
  setRecUI('idle');
  recStatus(REC_HINT);
}

$('#btn-rec').addEventListener('click', () => (rec.recorder?.state === 'recording' ? stopRec() : startRec()));
$('#btn-rec-del').addEventListener('click', () => { resetRec(); $('#btn-rec').focus(); });
$('#wizard').addEventListener('close', () => { if (rec.recorder?.state === 'recording') resetRec(); else releaseMic(); });

const setFont = (on) => {
  document.documentElement.classList.toggle('big', on);
  $('#font-ico').textContent = on ? 'A−' : 'A+';
  $('#btn-font').setAttribute('aria-label', on ? 'Diminuir o tamanho das letras' : 'Aumentar o tamanho das letras');
};
setFont(safe(() => localStorage.getItem('big')) === '1');
$('#btn-font').addEventListener('click', () => {
  const on = !document.documentElement.classList.contains('big');
  setFont(on);
  safe(() => localStorage.setItem('big', on ? '1' : '0'));
});

// Menu do topo no celular: abre/fecha, fecha ao tocar fora, com Esc ou ao abrir Minhas/Ajuda.
const menuBtn = $('#btn-menu');
const menu = $('#header-menu');
const setMenu = (open, returnFocus = false) => {
  menu.classList.toggle('open', open);
  menuBtn.setAttribute('aria-expanded', String(open));
  menuBtn.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
  if (open) menu.querySelector('button').focus();
  else if (returnFocus) menuBtn.focus();
};
menuBtn.addEventListener('click', () => setMenu(!menu.classList.contains('open')));
document.addEventListener('click', (e) => {
  if (menu.classList.contains('open') && !menu.contains(e.target) && !menuBtn.contains(e.target)) setMenu(false);
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.classList.contains('open')) setMenu(false, true); });
['#btn-mine', '#btn-help'].forEach((s) => $(s).addEventListener('click', () => setMenu(false)));

// Alto contraste: segue a escolha salva; sem escolha, segue o pedido do sistema (prefers-contrast).
const savedHc = safe(() => localStorage.getItem('hc'));
const setContrast = (on) => {
  document.documentElement.classList.toggle('hc', on);
  $('#btn-contrast').setAttribute('aria-pressed', String(on));
};
setContrast(savedHc != null ? savedHc === '1' : !!safe(() => matchMedia('(prefers-contrast: more)').matches));
$('#btn-contrast').addEventListener('click', () => {
  const on = !document.documentElement.classList.contains('hc');
  setContrast(on);
  safe(() => localStorage.setItem('hc', on ? '1' : '0'));
});

/* ---------- Início ---------- */
(async () => {
  try {
    categories = await api('/api/categories');
    buildCategories();
    icons();
    loadRiskAreas().catch(() => {});
    await refresh();
    if (!safe(() => localStorage.getItem('visto'))) { $('#help').showModal(); safe(() => localStorage.setItem('visto', '1')); }
  } catch (e) {
    $('#stats-text').textContent = 'Não consegui carregar o mapa. Verifique sua internet e recarregue a página.';
  }
})();

setInterval(() => { if (!document.hidden) refresh().catch(() => {}); }, 120_000);
