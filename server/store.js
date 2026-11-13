import fs from 'node:fs';
import path from 'node:path';

// Duas implementações da mesma interface: JSON (dev, testes, fallback) e PostgreSQL (produção).

export class JsonStore {
  constructor(file = null) {
    this.file = file;
    this.reports = new Map();
    this.photos = new Map();
    if (file && fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const r of raw.reports || []) this.reports.set(r.id, r);
      for (const [id, p] of Object.entries(raw.photos || {})) this.photos.set(id, p);
    }
  }
  _save() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify({ reports: [...this.reports.values()], photos: Object.fromEntries(this.photos) }));
  }
  async list() { return [...this.reports.values()]; }
  async get(id) { return this.reports.get(id) || null; }
  async getPhoto(id) { return this.photos.get(id) || null; }
  async create(report, photo) {
    this.reports.set(report.id, report);
    if (photo) this.photos.set(report.id, photo);
    this._save();
    return report;
  }
  async update(id, patch) {
    const cur = this.reports.get(id);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    this.reports.set(id, next);
    this._save();
    return next;
  }
  async count() { return this.reports.size; }
}

export class PgStore {
  constructor(pool) { this.pool = pool; }
  async init() {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      photo TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  }
  async list() {
    const { rows } = await this.pool.query('SELECT data FROM reports ORDER BY created_at DESC');
    return rows.map((r) => r.data);
  }
  async get(id) {
    const { rows } = await this.pool.query('SELECT data FROM reports WHERE id = $1', [id]);
    return rows[0]?.data || null;
  }
  async getPhoto(id) {
    const { rows } = await this.pool.query('SELECT photo FROM reports WHERE id = $1', [id]);
    return rows[0]?.photo || null;
  }
  async create(report, photo) {
    await this.pool.query('INSERT INTO reports (id, data, photo, created_at) VALUES ($1, $2, $3, $4)', [report.id, report, photo || null, report.criado_em]);
    return report;
  }
  async update(id, patch) {
    const cur = await this.get(id);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    await this.pool.query('UPDATE reports SET data = $2 WHERE id = $1', [id, next]);
    return next;
  }
  async count() {
    const { rows } = await this.pool.query('SELECT count(*)::int AS n FROM reports');
    return rows[0].n;
  }
}

export async function createStore() {
  if (process.env.DATABASE_URL) {
    const { default: pg } = await import('pg');
    const ssl = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false };
    const store = new PgStore(new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl }));
    await store.init();
    return store;
  }
  return new JsonStore(path.join(process.cwd(), 'data', 'db.json'));
}
