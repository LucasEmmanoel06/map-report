// Gera os arquivos compactos de dados oficiais usados pelo app, a partir do Portal de Dados Abertos do Recife.
// Uso: node scripts/build-recife-data.js            (baixa direto do portal)
//      node scripts/build-recife-data.js ./pasta    (usa arquivos já baixados: areas-sul.csv e atend-2024.csv)
// Licença dos dados: Open Database License (ODbL) – Prefeitura do Recife / Defesa Civil.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCES = {
  areas: {
    file: 'areas-sul.csv',
    url: 'https://dados.recife.pe.gov.br/dataset/c1d733d9-5867-481e-9c18-5fe572300ab2/resource/75344435-aca8-4aef-ab2c-9521d6e5ff18/download/areas-de-risco-da-regional-sul.csv',
  },
  atendimentos: {
    file: 'atend-2024.csv',
    url: 'https://dados.recife.pe.gov.br/dataset/ebda936c-f15a-4e0d-b8b6-5a9e270b0b67/resource/bbd37e34-44f7-4c21-a906-e4a2f560a359/download/atendimentos-2024.csv',
  },
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'server', 'data');
export const normalize = (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ');

async function read(src, dir) {
  if (dir) return fs.readFileSync(path.join(dir, src.file), 'utf8');
  const res = await fetch(src.url);
  if (!res.ok) throw new Error(`${src.url} -> HTTP ${res.status}`);
  return res.text();
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const cell = (s) => s.replace(/^"|"$/g, '').trim();
  const header = lines[0].split(';').map(cell);
  return lines.slice(1).map((l) => {
    const c = l.split(';').map(cell);
    return Object.fromEntries(header.map((h, i) => [h, c[i] ?? '']));
  });
}

function buildAreas(rows) {
  return rows
    .map((r) => {
      const nivel = /n[ií]vel (\d)/i.exec(r.descricao)?.[1];
      return {
        lat: Number(r.latitude),
        lng: Number(r.longitude),
        bairro: r.bairro,
        localidade: r.localidade,
        tipo: nivel ? `Área de risco nível ${nivel}` : r.descricao,
        nivel: nivel ? Number(nivel) : null,
      };
    })
    .filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lng) && a.lat < -7 && a.lat > -9);
}

function buildBairros(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = normalize(r.Bairro);
    if (!key || key === 'nao informado') continue;
    const b = map.get(key) || { nome: r.Bairro.trim(), atendimentos: 0, vistorias: 0, lonas: 0, risco_alto: 0, alagamentos: 0, deslizamentos: 0 };
    const sol = normalize(r.Solicitacao);
    const oc = normalize(r.Ocorrencia);
    const grau = normalize(r.Grau_de_Risco);
    b.atendimentos += 1;
    if (sol.includes('vistoria')) b.vistorias += 1;
    if (sol.includes('lona')) b.lonas += 1;
    if (grau === 'r3' || grau === 'r4') b.risco_alto += 1;
    if (oc.includes('alag') || sol.includes('alagado')) b.alagamentos += 1;
    if (oc.includes('desliz') || oc.includes('contencao')) b.deslizamentos += 1;
    map.set(key, b);
  }
  // Bairros no quinto superior de imóveis classificados R3/R4 recebem a marca "historico_alto".
  const sorted = [...map.values()].map((b) => b.risco_alto).sort((a, b) => b - a);
  const cut = sorted[Math.max(0, Math.floor(sorted.length * 0.2) - 1)] || Infinity;
  const out = {};
  for (const [key, b] of map) out[key] = { ...b, historico_alto: b.risco_alto >= cut && b.risco_alto > 0 };
  return out;
}

async function main() {
  const dir = process.argv[2] ? path.resolve(process.argv[2]) : null;
  const areas = buildAreas(parseCsv(await read(SOURCES.areas, dir)));
  const bairros = buildBairros(parseCsv(await read(SOURCES.atendimentos, dir)));
  fs.mkdirSync(outDir, { recursive: true });
  const meta = (fonte, url) => ({ fonte, url, licenca: 'ODbL', gerado_em: new Date().toISOString().slice(0, 10) });
  fs.writeFileSync(path.join(outDir, 'areas-risco.json'), JSON.stringify({ ...meta('Defesa Civil do Recife – Áreas de Risco da Regional Sul', SOURCES.areas.url), pontos: areas }));
  fs.writeFileSync(path.join(outDir, 'bairros-historico.json'), JSON.stringify({ ...meta('Defesa Civil do Recife – Registro de Atendimentos 2024', SOURCES.atendimentos.url), ano: 2024, bairros }));
  console.log(`${areas.length} pontos de área de risco · ${Object.keys(bairros).length} bairros com histórico`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
