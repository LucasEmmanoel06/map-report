import test from 'node:test';
import assert from 'node:assert/strict';
import { heuristicPriority, finalizePriority } from '../server/priority.js';
import { parseAiResponse, analyzeWithGemini } from '../server/ai.js';

test('regras: relato de perigo imediato com crianças vira prioridade alta', () => {
  const r = heuristicPriority({ category: 'encosta', description: 'Barreira desabando, há crianças morando embaixo' });
  assert.equal(r.prioridade, 'alta');
  assert.equal(r.imediato, true);
});

test('regras: lixo comum em bueiro fica com prioridade baixa', () => {
  const r = heuristicPriority({ category: 'bueiro', description: 'Um pouco de folhas no bueiro da esquina' });
  assert.equal(r.prioridade, 'baixa');
});

test('segurança: a IA nunca rebaixa um relato de perigo imediato', () => {
  const heur = heuristicPriority({ category: 'muro', description: 'O muro está caindo e vai cair na rua' });
  const ai = { prioridade: 'baixa', motivo: 'Parece pouco grave.' };
  const final = finalizePriority(ai, heur);
  assert.equal(final.prioridade, 'alta');
  assert.match(final.motivo, /Regra de segurança/);
});

test('IA: resposta inválida do modelo é rejeitada', () => {
  assert.throws(() => parseAiResponse('{"prioridade":"urgentissima"}'));
  assert.throws(() => parseAiResponse(''));
});

test('IA: lê resposta válida do Gemini e envia a foto', async () => {
  let body;
  const fetchImpl = async (_url, opts) => {
    body = JSON.parse(opts.body);
    const text = JSON.stringify({ foto_coerente: true, categoria_sugerida: 'bueiro', prioridade: 'media', motivo: 'Água pode acumular.', orientacao: 'Não jogue lixo.' });
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) };
  };
  const out = await analyzeWithGemini({ category: 'bueiro', description: 'bueiro entupido', photo: 'data:image/jpeg;base64,AAAA' }, { fetchImpl, apiKey: 'x' });
  assert.equal(out.prioridade, 'media');
  assert.equal(body.contents[0].parts[1].inline_data.mime_type, 'image/jpeg');
});

test('IA: sem chave configurada retorna null (usa regras)', async () => {
  assert.equal(await analyzeWithGemini({ category: 'bueiro', description: 'x' }, { apiKey: '' }), null);
});
