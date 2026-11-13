// Dados oficiais do Recife (Portal de Dados Abertos, licença ODbL), gerados por scripts/build-recife-data.js.
// - areas-risco.json: pontos mapeados pela Defesa Civil como área de risco (Regional Sul)
// - bairros-historico.json: atendimentos da Defesa Civil em 2024, agregados por bairro
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
const load = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));

export const AREAS = load('areas-risco.json');
export const BAIRROS = load('bairros-historico.json');

export const normalize = (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ');

export function distanceM(a, b) {
  const R = 6_371_000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Ponto oficial de área de risco mais próximo, até `maxM` metros.
export function nearestRiskArea(lat, lng, { maxM = 150, pontos = AREAS.pontos } = {}) {
  let best = null;
  for (const p of pontos) {
    const d = distanceM({ lat, lng }, p);
    if (d <= maxM && (!best || d < best.distancia_m)) best = { ...p, distancia_m: Math.round(d) };
  }
  return best;
}

export function bairroHistory(nome, { bairros = BAIRROS.bairros, ano = BAIRROS.ano } = {}) {
  const b = bairros[normalize(nome)];
  return b ? { ...b, ano } : null;
}

// Contexto oficial de um ponto: usado pelas regras de prioridade, pelo prompt da IA e exibido ao morador.
export function officialContext(lat, lng, bairro, alternativas = []) {
  const area = nearestRiskArea(lat, lng);
  let hist = null;
  for (const nome of [bairro, ...alternativas, area?.bairro]) {
    hist = nome ? bairroHistory(nome) : null;
    if (hist) break;
  }
  return {
    area: area ? { localidade: area.localidade, bairro: area.bairro, tipo: area.tipo, nivel: area.nivel, distancia_m: area.distancia_m } : null,
    bairro: hist,
  };
}

export const SOURCES = [
  { nome: AREAS.fonte, url: AREAS.url, licenca: AREAS.licenca },
  { nome: BAIRROS.fonte, url: BAIRROS.url, licenca: BAIRROS.licenca },
];
