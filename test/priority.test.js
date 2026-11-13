import test from 'node:test';
import assert from 'node:assert/strict';
import { heuristicPriority, finalizePriority } from '../server/priority.js';
import { parseAiResponse, analyzeWithGemini, transcribeAudio } from '../server/ai.js';

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

test('IA: modelo aposentado (404) cai automaticamente para o próximo modelo', async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    if (urls.length === 1) return { ok: false, status: 404 };
    const text = JSON.stringify({ foto_coerente: true, categoria_sugerida: 'muro', prioridade: 'alta', motivo: 'Muro cedendo.', orientacao: 'Afaste-se.' });
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'pensando…', thought: true }, { text }] } }] }) };
  };
  const out = await analyzeWithGemini({ category: 'muro', description: 'muro cedendo' }, { fetchImpl, apiKey: 'x' });
  assert.equal(out.prioridade, 'alta');
  assert.equal(urls.length, 2);
  assert.notEqual(urls[0], urls[1]);
});

test('IA: sem chave configurada retorna null (usa regras)', async () => {
  assert.equal(await analyzeWithGemini({ category: 'bueiro', description: 'x' }, { apiKey: '' }), null);
});

test('IA: transcreve áudio enviando o formato certo ao Gemini', async () => {
  let body;
  const fetchImpl = async (_url, opts) => {
    body = JSON.parse(opts.body);
    const text = JSON.stringify({ tem_fala: true, texto: '  A barreira   está rachando  ' });
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) };
  };
  const out = await transcribeAudio('data:audio/webm;codecs=opus;base64,AAAA', { fetchImpl, apiKey: 'x' });
  assert.equal(out, 'A barreira está rachando');
  assert.equal(body.contents[0].parts[1].inline_data.mime_type, 'audio/webm');
  assert.equal(body.contents[0].parts[1].inline_data.data, 'AAAA');
});

test('IA: áudio sem fala devolve texto vazio; sem chave devolve null', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"tem_fala":false,"texto":"[ruído]"}' }] } }] }) });
  assert.equal(await transcribeAudio('data:audio/mp4;base64,AAAA', { fetchImpl, apiKey: 'x' }), '');
  assert.equal(await transcribeAudio('data:audio/mp4;base64,AAAA', { apiKey: '' }), null);
});
