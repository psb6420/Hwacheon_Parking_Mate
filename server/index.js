import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CATALOG } from '../src/catalog.js';
import { expire, lotsView, autoReserve, transition, updateLot } from '../src/domain.js';

export function createServer({ dbPath = ':memory:', adminKey, origins = [] } = {}) {
  if (!adminKey || adminKey.length < 32) throw new Error('ADMIN_KEY must contain at least 32 characters.');
  if (dbPath !== ':memory:') mkdirSync(dirname(resolve(dbPath)), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL)');
  db.prepare('INSERT OR IGNORE INTO state VALUES (1, ?)').run(JSON.stringify({ lots: CATALOG.map(l => ({ ...l, updatedAt: Date.now() })), reservations: [], events: [] }));
  // One synchronous transaction covers expiry, capacity checks and the reservation write.
  // This also serializes separate Node processes sharing the same local SQLite database.
  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const state = expire(JSON.parse(db.prepare('SELECT body FROM state WHERE id=1').get().body));
      const result = fn(state);
      state.events = state.events.slice(0, 100);
      state.reservations = state.reservations.filter(r => ['reserved', 'checked_in'].includes(r.status) || (r.updatedAt || r.expiresAt) > Date.now() - 7 * 86400000);
      db.prepare('UPDATE state SET body=? WHERE id=1').run(JSON.stringify(state));
      db.exec('COMMIT'); return result;
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  const limits = new Map();
  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (code, data) => { res.writeHead(code); res.end(JSON.stringify(data)); };
    const origin = req.headers.origin;
    if (origin && !origins.includes(origin)) return send(403, { error: '허용되지 않은 출처입니다.' });
    if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
      return send(204, null);
    }
    const now = Date.now();
    for (const [key, item] of limits) if (item.until < now) limits.delete(key);
    const ip = req.socket.remoteAddress || 'unknown';
    const bucket = limits.get(ip) || { count: 0, until: now + 60000 };
    limits.set(ip, bucket);
    if (++bucket.count > 120) return send(429, { error: '요청이 많습니다. 잠시 후 다시 시도해 주세요.' });
    const path = new URL(req.url, 'http://localhost').pathname;
    const isAdmin = path === '/api/admin' || ['checkin', 'checkout'].some(x => path === `/api/${x}`) || req.method === 'PATCH';
    if (isAdmin) {
      const supplied = Buffer.from((req.headers.authorization || '').replace(/^Bearer /, ''));
      const expected = Buffer.from(adminKey);
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return send(401, { error: '운영자 인증이 필요합니다.' });
    }
    try {
      let body = {};
      if (['POST', 'PATCH'].includes(req.method)) {
        let raw = ''; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 8192) return send(413, { error: '요청 크기가 너무 큽니다.' }); raw += chunk.toString(); }
        try { body = JSON.parse(raw || '{}'); } catch { return send(400, { error: '올바른 JSON이 아닙니다.' }); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) return send(400, { error: '올바른 요청이 아닙니다.' });
      }
      if (req.method === 'GET' && path === '/api/lots') return send(200, transaction(s => ({ lots: lotsView(s), demo: true })));
      if (req.method === 'GET' && path === '/api/admin') return send(200, transaction(s => ({ events: s.events })));
      if (req.method === 'POST' && path === '/api/reservations') {
        if (typeof body.clientId !== 'string' || !/^[\w-]{20,80}$/.test(body.clientId)) return send(400, { error: '기기 식별자가 올바르지 않습니다.' });
        if (body.accessible !== undefined && typeof body.accessible !== 'boolean') return send(400, { error: '보행 편의 조건이 올바르지 않습니다.' });
        return send(201, transaction(s => autoReserve(s, { position: body.position, people: body.people, accessible: body.accessible, clientId: body.clientId, token: randomUUID() })));
      }
      if (req.method === 'POST' && path === '/api/ticket') {
        const ticket = transaction(s => s.reservations.find(r => r.token === body.token));
        return ticket ? send(200, ticket) : send(404, { error: '예약을 찾을 수 없습니다.' });
      }
      if (req.method === 'POST' && ['/api/cancel', '/api/checkin', '/api/checkout'].includes(path)) {
        const action = path.split('/').at(-1);
        return send(200, transaction(s => { const r = transition(s, body.token, action); s.events.unshift({ at: now, text: `${r.lotId} · ${action} 처리` }); return r; }));
      }
      if (req.method === 'PATCH' && path.startsWith('/api/lots/')) return send(200, transaction(s => {
        const lot = updateLot(s, path.split('/').at(-1), body);
        s.events.unshift({ at: now, text: `${lot.id} 상태 변경 · 일반 차량 ${lot.occupied}대 · ${lot.status}` }); return lot;
      }));
      send(404, { error: '요청 경로를 찾을 수 없습니다.' });
    } catch (error) { send(400, { error: error.message }); }
  });
  server.on('close', () => db.close());
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const server = createServer({ dbPath: process.env.DB_PATH || './data/parking.sqlite', adminKey: process.env.ADMIN_KEY, origins: (process.env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean) });
  server.listen(Number(process.env.PORT || 8787), process.env.HOST || '127.0.0.1', () => console.log('Parking API ready (example dataset).'));
}
