import { getCategory } from './categories.js';

export const LEVELS = ['baixa', 'media', 'alta'];

const strip = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

// Sinais de perigo imediato: a IA nunca pode deixar a prioridade abaixo de "alta" quando aparecem.
const IMMEDIATE = /(desabando|desabou|desmoron|vai cair|caindo|deslizou|deslizamento|barreira caiu|risco de vida|rachadura (grande|enorme|aberta)|casa.* (rachou|cedeu))/;
// Sinais que aumentam a exposição de pessoas.
const EXPOSURE = /(crianca|idos[oa]|morador|moradia|morando|familia|escola|creche|hospital|posto de saude|casas? (embaixo|abaixo|perto)|transbord|cresc|mina d.?agua|enxurrada)/;
const MINOR = /(pequen|leve|pouco|poucos|comecando)/;

export function heuristicPriority({ category, description }) {
  const text = strip(description);
  const base = getCategory(category)?.base || 'baixa';
  let score = LEVELS.indexOf(base);
  const reasons = [];
  const imediato = IMMEDIATE.test(text);
  if (imediato) {
    score = 2;
    reasons.push('o relato indica perigo imediato');
  }
  if (EXPOSURE.test(text)) {
    score += 1;
    reasons.push('há pessoas ou serviços importantes por perto');
  }
  if (MINOR.test(text) && !imediato) score -= 1;
  score = Math.max(0, Math.min(2, score));
  const prioridade = LEVELS[score];
  const motivo = reasons.length
    ? `Prioridade ${prioridade}: ${reasons.join(' e ')}.`
    : `Prioridade ${prioridade}: risco típico deste tipo de problema em dias de chuva forte.`;
  return { prioridade, motivo, imediato };
}

// A IA sugere, as regras de segurança podem elevar. Nunca rebaixam.
export function finalizePriority(ai, heuristic) {
  if (!ai) {
    return { prioridade: heuristic.prioridade, motivo: heuristic.motivo, fonte: 'regras' };
  }
  let prioridade = LEVELS.includes(ai.prioridade) ? ai.prioridade : heuristic.prioridade;
  let motivo = ai.motivo || heuristic.motivo;
  if (heuristic.imediato && prioridade !== 'alta') {
    prioridade = 'alta';
    motivo = `${motivo} Regra de segurança: o relato fala em perigo imediato, por isso a prioridade subiu para alta.`;
  }
  return { prioridade, motivo, fonte: 'ia' };
}
