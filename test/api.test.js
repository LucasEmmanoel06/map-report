import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/index.js';
import { JsonStore } from '../server/store.js';

const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBD';
const valid = { categoria: 'encosta', descricao: 'Rachadura grande na encosta, casas embaixo', lat: -8.05, lng: -34.88, foto: PHOTO };

async function start(analyze = async () => null, transcribe = async () => null) {
  const app = createApp({ store: new JsonStore(), analyze, transcribe, geocode: async () => ({ bairro: 'Casa Amarela', rua: 'Rua Teste' }), adminPin: '1234' });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (path, opts = {}) => fetch(base + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  return { call, close: () => server.close() };
}

test('API: recusa denúncia sem foto', async () => {
  const { call, close } = await start();
  const res = await call('/api/reports', { method: 'POST', body: JSON.stringify({ ...valid, foto: undefined }) });
  assert.equal(res.status, 400);
  assert.match((await res.json()).erro, /foto/i);
  close();
});

test('API: recusa local fora da Região Metropolitana do Recife', async () => {
  const { call, close } = await start();
  const res = await call('/api/reports', { method: 'POST', body: JSON.stringify({ ...valid, lat: -23.5, lng: -46.6 }) });
  assert.equal(res.status, 400);
  close();
});

test('API: cria denúncia, aplica prioridade, serve a foto e lista sem o binário', async () => {
  const { call, close } = await start(async () => ({ foto_coerente: true, prioridade: 'media', motivo: 'Teste', orientacao: 'Afaste-se.', categoria_sugerida: 'encosta' }));
  const res = await call('/api/reports', { method: 'POST', body: JSON.stringify(valid) });
  assert.equal(res.status, 201);
  const created = await res.json();
  // IA disse "media", mas o relato fala de perigo imediato: regra de segurança sobe para alta
  assert.equal(created.prioridade, 'alta');
  assert.equal(created.bairro, 'Casa Amarela');

  const list = await (await call('/api/reports')).json();
  assert.equal(list.length, 1);
  assert.equal(list[0].foto, undefined);
  const photo = await call(created.foto_url);
  assert.equal(photo.headers.get('content-type'), 'image/jpeg');
  close();
});

test('API: IA fora do ar não bloqueia a denúncia (cai para regras)', async () => {
  const { call, close } = await start(async () => { throw new Error('timeout'); });
  const res = await call('/api/reports', { method: 'POST', body: JSON.stringify(valid) });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).fonte_prioridade, 'regras');
  close();
});

test('API: "também vi" conta uma vez por aparelho', async () => {
  const { call, close } = await start();
  const { id } = await (await call('/api/reports', { method: 'POST', body: JSON.stringify(valid) })).json();
  await call(`/api/reports/${id}/confirm`, { method: 'POST', headers: { 'x-client-id': 'a' } });
  await call(`/api/reports/${id}/confirm`, { method: 'POST', headers: { 'x-client-id': 'a' } });
  const r = await (await call(`/api/reports/${id}/confirm`, { method: 'POST', headers: { 'x-client-id': 'b' } })).json();
  assert.equal(r.confirmacoes, 2);
  close();
});

test('API: auditoria humana exige PIN e registra a revisão', async () => {
  const { call, close } = await start();
  const { id } = await (await call('/api/reports', { method: 'POST', body: JSON.stringify(valid) })).json();
  const denied = await call(`/api/admin/reports/${id}`, { method: 'PATCH', headers: { 'x-admin-pin': 'errado' }, body: JSON.stringify({ prioridade: 'baixa' }) });
  assert.equal(denied.status, 401);
  const ok = await call(`/api/admin/reports/${id}`, { method: 'PATCH', headers: { 'x-admin-pin': '1234' }, body: JSON.stringify({ prioridade: 'baixa', status: 'em_analise' }) });
  const body = await ok.json();
  assert.equal(body.prioridade, 'baixa');
  assert.equal(body.prioridade_ia, 'alta');
  assert.equal(body.revisada_por_humano, true);
  assert.ok(body.primeira_acao_em);
  const stats = await (await call('/api/stats')).json();
  assert.equal(stats.em_analise, 1);
  close();
});

const AUDIO = 'data:audio/webm;codecs=opus;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYEC';

test('API: áudio sem texto vira a descrição (transcrição)', async () => {
  let recebido;
  const { call, close } = await start(undefined, async (a) => { recebido = a; return 'O canal está cheio de lixo perto das casas'; });
  const res = await call('/api/reports', { method: 'POST', body: JSON.stringify({ ...valid, descricao: '', audio: AUDIO }) });
  assert.equal(res.status, 201);
  const r = await res.json();
  assert.equal(r.descricao, 'O canal está cheio de lixo perto das casas');
  assert.equal(r.descricao_por_audio, true);
  assert.equal(recebido, AUDIO);
  assert.equal(r.audio, undefined); // o áudio não é guardado
  close();
});

test('API: texto escrito + áudio são juntados na descrição', async () => {
  const { call, close } = await start(undefined, async () => 'e a água já entrou em duas casas');
  const res = await call('/api/reports', { method: 'POST', body: JSON.stringify({ ...valid, descricao: 'Canal transbordando', audio: AUDIO }) });
  assert.equal((await res.json()).descricao, 'Canal transbordando e a água já entrou em duas casas');
  close();
});

test('API: áudio sem fala e sem texto é recusado com mensagem clara', async () => {
  const { call, close } = await start(undefined, async () => '');
  const res = await call('/api/reports', { method: 'POST', body: JSON.stringify({ ...valid, descricao: '', audio: AUDIO }) });
  assert.equal(res.status, 422);
  assert.match((await res.json()).erro, /entender o áudio/);
  close();
});

test('API: transcrição fora do ar não perde a denúncia que tem texto', async () => {
  const { call, close } = await start(undefined, async () => { throw new Error('timeout'); });
  const res = await call('/api/reports', { method: 'POST', body: JSON.stringify({ ...valid, audio: AUDIO }) });
  assert.equal(res.status, 201);
  const r = await res.json();
  assert.equal(r.descricao, valid.descricao);
  assert.equal(r.descricao_por_audio, false);
  close();
});

test('API: recusa áudio em formato inválido', async () => {
  const { call, close } = await start();
  const res = await call('/api/reports', { method: 'POST', body: JSON.stringify({ ...valid, audio: 'data:text/html;base64,PHNjcmlwdD4=' }) });
  assert.equal(res.status, 400);
  close();
});

test('API: painel exclui qualquer denúncia (com PIN) e apaga a foto', async () => {
  const { call, close } = await start();
  const { id, foto_url } = await (await call('/api/reports', { method: 'POST', body: JSON.stringify(valid) })).json();

  const semPin = await call(`/api/admin/reports/${id}`, { method: 'DELETE' });
  assert.equal(semPin.status, 401);
  assert.equal((await (await call('/api/reports')).json()).length, 1);

  const res = await call(`/api/admin/reports/${id}`, { method: 'DELETE', headers: { 'x-admin-pin': '1234' } });
  assert.equal(res.status, 200);
  assert.equal((await (await call('/api/reports')).json()).length, 0);
  assert.equal((await call(foto_url)).status, 404);

  const deNovo = await call(`/api/admin/reports/${id}`, { method: 'DELETE', headers: { 'x-admin-pin': '1234' } });
  assert.equal(deNovo.status, 404);
  close();
});
