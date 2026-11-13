import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, CATEGORY_IDS } from './categories.js';
import { analyzeWithGemini } from './ai.js';
import { heuristicPriority, finalizePriority, LEVELS } from './priority.js';
import { reverseGeocode } from './geocode.js';
import { createStore } from './store.js';
import { seedReports } from './seed.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATUSES = ['aberta', 'em_analise', 'resolvida'];
// Região Metropolitana do Recife (caixa aproximada)
const BBOX = { minLat: -8.6, maxLat: -7.6, minLng: -35.3, maxLng: -34.7 };
const MAX_PHOTO_CHARS = 1_800_000;

const publicReport = (r) => {
  const { confirmacoes, ...rest } = r;
  return { ...rest, confirmacoes: confirmacoes.length, foto_url: r.tem_foto ? `/api/reports/${r.id}/photo` : null };
};

// Limitador simples por IP, para proteger a cota gratuita da IA contra abuso.
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    const entry = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (entry.length >= max) return res.status(429).json({ erro: 'Muitas tentativas. Espere um pouco e tente de novo.' });
    entry.push(now);
    hits.set(key, entry);
    next();
  };
}

export function createApp({ store, analyze = analyzeWithGemini, geocode = reverseGeocode, adminPin = process.env.ADMIN_PIN || 'defesacivil' }) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '2.5mb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/categories', (_req, res) => res.json(CATEGORIES));

  app.get('/api/reports', async (_req, res) => {
    const all = await store.list();
    res.json(all.map(publicReport));
  });

  app.get('/api/reports/:id/photo', async (req, res) => {
    const photo = await store.getPhoto(req.params.id);
    const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(photo || '');
    if (!m) return res.status(404).end();
    res.set('Content-Type', m[1]).set('Cache-Control', 'public, max-age=86400').send(Buffer.from(m[2], 'base64'));
  });

  app.post('/api/reports', rateLimit({ windowMs: 60_000, max: 6 }), async (req, res) => {
    const { categoria, descricao, lat, lng, foto } = req.body || {};
    const desc = String(descricao || '').trim();
    if (!CATEGORY_IDS.includes(categoria)) return res.status(400).json({ erro: 'Escolha o tipo de problema.' });
    if (!foto || !/^data:image\/(jpeg|png|webp);base64,/.test(foto)) return res.status(400).json({ erro: 'Envie pelo menos uma foto do problema.' });
    if (foto.length > MAX_PHOTO_CHARS) return res.status(413).json({ erro: 'A foto é muito grande. Tente outra.' });
    if (desc.length < 10) return res.status(400).json({ erro: 'Conte em poucas palavras o que você viu (mínimo 10 letras).' });
    if (desc.length > 500) return res.status(400).json({ erro: 'A descrição está muito longa (máximo 500 letras).' });
    const la = Number(lat), ln = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln) || la < BBOX.minLat || la > BBOX.maxLat || ln < BBOX.minLng || ln > BBOX.maxLng) {
      return res.status(400).json({ erro: 'Marque o local no mapa, dentro da Região Metropolitana do Recife.' });
    }

    const heur = heuristicPriority({ category: categoria, description: desc });
    let ai = null;
    try {
      ai = await analyze({ category: categoria, description: desc, photo: foto });
    } catch (err) {
      console.warn('IA indisponível, usando regras:', err.message);
    }
    const final = finalizePriority(ai, heur);
    const place = await geocode(la, ln);

    const report = {
      id: crypto.randomUUID(),
      categoria,
      descricao: desc,
      lat: la,
      lng: ln,
      bairro: place.bairro || null,
      rua: place.rua || null,
      prioridade: final.prioridade,
      prioridade_ia: final.prioridade,
      revisada_por_humano: false,
      motivo: final.motivo,
      orientacao: ai?.orientacao || 'Mantenha distância do local. Em caso de perigo imediato, ligue 199 (Defesa Civil).',
      fonte_prioridade: final.fonte,
      foto_coerente: ai ? ai.foto_coerente : true,
      tem_foto: true,
      ficticio: false,
      status: 'aberta',
      confirmacoes: [],
      criado_em: new Date().toISOString(),
      primeira_acao_em: null,
      resolvido_em: null,
    };
    await store.create(report, foto);
    res.status(201).json(publicReport(report));
  });

  // "Também vi isso": cada aparelho confirma uma vez. Mais confirmações = mais confiança.
  app.post('/api/reports/:id/confirm', rateLimit({ windowMs: 60_000, max: 30 }), async (req, res) => {
    const cid = String(req.get('x-client-id') || '').slice(0, 64);
    if (!cid) return res.status(400).json({ erro: 'Identificação do aparelho ausente.' });
    const r = await store.get(req.params.id);
    if (!r) return res.status(404).json({ erro: 'Denúncia não encontrada.' });
    if (!r.confirmacoes.includes(cid)) {
      const updated = await store.update(r.id, { confirmacoes: [...r.confirmacoes, cid] });
      return res.json(publicReport(updated));
    }
    res.json(publicReport(r));
  });

  // Indicador do pitch: % das denúncias de prioridade ALTA que já receberam ação, e tempo mediano até a 1ª ação.
  app.get('/api/stats', async (_req, res) => {
    const all = await store.list();
    const high = all.filter((r) => r.prioridade === 'alta');
    const acted = high.filter((r) => r.status !== 'aberta');
    const waits = all.filter((r) => r.primeira_acao_em).map((r) => (new Date(r.primeira_acao_em) - new Date(r.criado_em)) / 3600_000).sort((a, b) => a - b);
    const median = waits.length ? waits[Math.floor(waits.length / 2)] : null;
    res.json({
      total: all.length,
      abertas: all.filter((r) => r.status === 'aberta').length,
      em_analise: all.filter((r) => r.status === 'em_analise').length,
      resolvidas: all.filter((r) => r.status === 'resolvida').length,
      alta: high.length,
      alta_com_acao_pct: high.length ? Math.round((acted.length / high.length) * 100) : null,
      horas_ate_primeira_acao: median === null ? null : Math.round(median * 10) / 10,
    });
  });

  // Auditoria humana: Defesa Civil confirma/corrige a prioridade da IA e muda o status.
  const requirePin = (req, res, next) => {
    const pin = String(req.get('x-admin-pin') || '');
    const a = Buffer.from(pin), b = Buffer.from(adminPin);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ erro: 'PIN incorreto.' });
    next();
  };
  app.post('/api/admin/check', rateLimit({ windowMs: 60_000, max: 10 }), requirePin, (_req, res) => res.json({ ok: true }));
  app.patch('/api/admin/reports/:id', rateLimit({ windowMs: 60_000, max: 60 }), requirePin, async (req, res) => {
    const { prioridade, status } = req.body || {};
    const r = await store.get(req.params.id);
    if (!r) return res.status(404).json({ erro: 'Denúncia não encontrada.' });
    const patch = {};
    if (prioridade !== undefined) {
      if (!LEVELS.includes(prioridade)) return res.status(400).json({ erro: 'Prioridade inválida.' });
      patch.prioridade = prioridade;
      patch.revisada_por_humano = true;
    }
    if (status !== undefined) {
      if (!STATUSES.includes(status)) return res.status(400).json({ erro: 'Status inválido.' });
      patch.status = status;
      const now = new Date().toISOString();
      if (status !== 'aberta' && !r.primeira_acao_em) patch.primeira_acao_em = now;
      patch.resolvido_em = status === 'resolvida' ? now : null;
    }
    res.json(publicReport(await store.update(r.id, patch)));
  });

  app.use('/vendor/leaflet', express.static(path.join(root, 'node_modules', 'leaflet', 'dist')));
  app.use('/vendor/lucide', express.static(path.join(root, 'node_modules', 'lucide', 'dist', 'umd')));
  app.use(express.static(path.join(root, 'public')));
  return app;
}

async function main() {
  const store = await createStore();
  if (process.env.SEED !== 'false' && (await store.count()) === 0) {
    for (const r of seedReports()) await store.create(r, null);
  }
  const port = Number(process.env.PORT) || 3000;
  createApp({ store }).listen(port, () => console.log(`Olho no Risco rodando em http://localhost:${port}`));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
