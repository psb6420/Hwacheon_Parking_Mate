import { CATALOG, FESTIVAL } from './catalog.js';
import { expire, lotsView, autoReserve, transition, updateLot } from './domain.js';
const LIVE_KEY = 'hwacheon-parking-v1', PREVIEW_KEY = 'hwacheon-parking-preview-v1';
export let isPreview = sessionStorage.getItem('hwacheon-preview') === 'true';
export const ticketStorageKey = () => isPreview ? 'hwacheon-preview-ticket' : 'hwacheon-ticket';
export function setPreviewMode(enabled) { isPreview = enabled; sessionStorage.setItem('hwacheon-preview', String(enabled)); }
const storageKey = () => isPreview ? PREVIEW_KEY : LIVE_KEY;
const remote = () => isRemote && !isPreview;
const initial = () => ({ lots: CATALOG.map(l => ({ ...l, updatedAt: Date.now() })), reservations: [], events: [] });
export function readLocal() {
  try { const s = JSON.parse(localStorage.getItem(storageKey())); if (Array.isArray(s?.lots) && Array.isArray(s?.reservations) && Array.isArray(s?.events)) return expire(s); } catch { /* Recover corrupt or cleared demo storage. */ }
  return initial();
}
export const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
export const isRemote = !!apiBase;
let clientId = localStorage.getItem('hwacheon-client');
if (!clientId) { clientId = crypto.randomUUID(); localStorage.setItem('hwacheon-client', clientId); }
export let adminKey = '';
export function setAdminKey(key) { adminKey = key; }
async function request(path, method = 'GET', body, admin = false) {
  const response = await fetch(`${apiBase}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(admin ? { Authorization: `Bearer ${adminKey}` } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '서버 요청에 실패했습니다.');
  return data;
}
async function mutate(fn) {
  const key = storageKey();
  const work = () => {
    const state = readLocal(); const result = fn(state);
    localStorage.setItem(key, JSON.stringify(state));
    return structuredClone(result);
  };
  return navigator.locks ? navigator.locks.request(key, work) : work();
}
export const service = {
  async lots() { return remote() ? request('/api/lots') : { lots: lotsView(readLocal()), demo: true }; },
  async reserveAuto(position, people, accessible = false) {
    if (isPreview) return mutate(s => {
      for (const lot of s.lots) lot.updatedAt = Date.now();
      const r = autoReserve(s, { position: { lat: FESTIVAL.lat, lng: FESTIVAL.lng, accuracy: 10, timestamp: Date.now() }, people, accessible, clientId, token: 'preview-' + crypto.randomUUID() });
      r.preview = true; r.assignment = 'preview'; delete r.entryVerifiedAt; return r;
    });
    return remote() ? request('/api/reservations', 'POST', { position, people, accessible, clientId }) : mutate(s => autoReserve(s, { position, people, accessible, clientId, token: crypto.randomUUID() }));
  },
  async ticket(token) {
    if (remote()) return request('/api/ticket', 'POST', { token });
    const ticket = readLocal().reservations.find(r => r.token === token);
    if (!ticket) throw new Error('이 브라우저에 저장된 예약이 아닙니다. 시연 예약은 같은 브라우저에서만 조회할 수 있습니다.');
    return ticket;
  },
  async action(token, action) {
    return remote() ? request(`/api/${action}`, 'POST', { token }, action !== 'cancel') : mutate(s => {
      const result = transition(s, token, action);
      s.events.unshift({ at: Date.now(), text: `${result.lotId} · ${{cancel:'예약 취소',checkin:'입차',checkout:'출차'}[action]} 처리` });
      s.events = s.events.slice(0, 100);
      return result;
    });
  },
  async update(id, values) {
    return remote() ? request(`/api/lots/${id}`, 'PATCH', values, true) : mutate(s => { const lot = updateLot(s, id, values); s.events.unshift({ at: Date.now(), text: `${id} 상태 변경 · 일반 차량 ${lot.occupied}대 · ${lot.status}` }); s.events = s.events.slice(0, 100); return lot; });
  },
  async admin() { return remote() ? request('/api/admin', 'GET', null, true) : { events: readLocal().events }; },
  async reset() { if (!remote()) return mutate(s => Object.assign(s, initial())); }
};
