import { getCategory } from './categories.js';

export const LEVELS = ['baixa', 'media', 'alta'];
const rank = (p) => LEVELS.indexOf(p);

const strip = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

// Sinais de perigo imediato: a IA nunca pode deixar a prioridade abaixo de "alta" quando aparecem.
const IMMEDIATE = /(desabando|desabou|desmoron|vai cair|caindo|deslizou|deslizamento|barreira caiu|risco de vida|rachadura (grande|enorme|aberta)|casa.* (rachou|cedeu))/;
// Sinais que aumentam a exposição de pessoas.
const EXPOSURE = /(crianca|idos[oa]|morador|moradia|morando|familia|escola|creche|hospital|posto de saude|casas? (embaixo|abaixo|perto)|transbord|cresc|mina d.?agua|enxurrada)/;
const MINOR = /(pequen|leve|pouco|poucos|comecando)/;

// Tipos de problema ligados a deslizamento (onde o mapeamento de risco da Defesa Civil é mais relevante)
// e ligados a água (onde o histórico de alagamentos do bairro pesa).
const SLOPE = new Set(['encosta', 'muro', 'erosao', 'arvore', 'outro']);
const WATER = new Set(['alagamento', 'bueiro', 'canal_lixo', 'mangue']);

// Dados oficiais do Recife (Defesa Civil) que elevam a prioridade. No máximo +1 nível por contexto.
export function contextFactor(category, context) {
  if (!context) return null;
  const { area, bairro } = context;
  if (area && SLOPE.has(category)) {
    return { bump: 1, piso: 'media', motivo: `o local fica a ${area.distancia_m} m de uma ${area.tipo.toLowerCase()} mapeada pela Defesa Civil (${area.localidade})` };
  }
  if (area && WATER.has(category)) {
    return { bump: 0, piso: 'media', motivo: `o local fica numa área de risco mapeada pela Defesa Civil (${area.localidade})` };
  }
  if (bairro?.historico_alto && SLOPE.has(category)) {
    return { bump: 1, piso: null, motivo: `${bairro.nome} está entre os bairros com mais imóveis em risco alto atendidos pela Defesa Civil em ${bairro.ano} (${bairro.risco_alto})` };
  }
  if (bairro && bairro.alagamentos >= 5 && WATER.has(category)) {
    return { bump: 1, piso: null, motivo: `a Defesa Civil registrou ${bairro.alagamentos} ocorrências de alagamento em ${bairro.nome} em ${bairro.ano}` };
  }
  return null;
}

export function heuristicPriority({ category, description, context = null }) {
  const text = strip(description);
  const base = getCategory(category)?.base || 'baixa';
  let score = rank(base);
  const reasons = [];
  const imediato = IMMEDIATE.test(text);
  let piso = null;
  if (imediato) {
    score = 2;
    piso = 'alta';
    reasons.push('o relato indica perigo imediato');
  }
  if (EXPOSURE.test(text)) {
    score += 1;
    reasons.push('há pessoas ou serviços importantes por perto');
  }
  const ctx = contextFactor(category, context);
  if (ctx) {
    score += ctx.bump;
    reasons.push(ctx.motivo);
    if (ctx.piso && (!piso || rank(ctx.piso) > rank(piso))) piso = ctx.piso;
  }
  if (MINOR.test(text) && !imediato) score -= 1;
  score = Math.max(piso ? rank(piso) : 0, Math.min(2, score));
  const prioridade = LEVELS[score];
  const motivo = reasons.length
    ? `Prioridade ${prioridade}: ${reasons.join('; ')}.`
    : `Prioridade ${prioridade}: risco típico deste tipo de problema em dias de chuva forte.`;
  return { prioridade, motivo, imediato, piso, dados_oficiais: Boolean(ctx) };
}

// A IA sugere; as regras de segurança podem elevar até um piso. Nunca rebaixam.
export function finalizePriority(ai, heuristic) {
  if (!ai) {
    return { prioridade: heuristic.prioridade, motivo: heuristic.motivo, fonte: 'regras' };
  }
  let prioridade = LEVELS.includes(ai.prioridade) ? ai.prioridade : heuristic.prioridade;
  let motivo = ai.motivo || heuristic.motivo;
  const piso = heuristic.piso || (heuristic.imediato ? 'alta' : null);
  if (piso && rank(prioridade) < rank(piso)) {
    prioridade = piso;
    const porque = heuristic.imediato ? 'o relato fala em perigo imediato' : 'o local está numa área de risco oficial da Defesa Civil';
    motivo = `${motivo} Regra de segurança: ${porque}, por isso a prioridade subiu para ${piso}.`;
  }
  return { prioridade, motivo, fonte: 'ia' };
}
