export const HOLD_MS = 30 * 60 * 1000;
export const STALE_MS = 15 * 60 * 1000;
export function expire(state, now = Date.now()) {
  for (const r of state.reservations) if (r.status === 'reserved' && r.expiresAt <= now) r.status = 'expired';
  return state;
}
export function lotsView(state, now = Date.now()) {
  expire(state, now);
  return state.lots.map(l => {
    const reserved = state.reservations.filter(r => r.lotId === l.id && r.status === 'reserved').length;
    const checkedIn = state.reservations.filter(r => r.lotId === l.id && r.status === 'checked_in').length;
    const available = Math.max(0, l.capacity - l.occupied - reserved - checkedIn);
    const stale = now - l.updatedAt > STALE_MS;
    return { ...l, reserved, checkedIn, available, stale, label: l.status === 'closed' ? '운영 중지' : stale ? '확인 필요' : available === 0 ? '만차' : available / l.capacity < 0.2 ? '혼잡' : '여유' };
  });
}
export function rankLots(lots, preference = 'balanced', accessible = false) {
  return lots.filter(l => (!accessible || l.accessible)).map(l => {
    const ratio = l.available / l.capacity;
    const access = 1 - Math.min(l.walk, 30) / 30;
    const eligible = l.status === 'open' && l.available > 0 && !l.stale;
    const score = !eligible ? -1 : preference === 'walk' ? access : preference === 'shuttle' ? (l.shuttle ? 0.7 : 0) + ratio * 0.3 : ratio * 0.65 + access * 0.35;
    return { ...l, score, eligible, reason: !eligible ? l.label : preference === 'walk' ? `축제장까지 도보 약 ${l.walk}분` : preference === 'shuttle' && l.shuttle ? `셔틀 ${l.shuttle.interval}분 간격 · 주차 여유 ${l.available}면` : `여유 ${l.available}면 · 도보 약 ${l.walk}분` };
  }).sort((a, b) => b.score - a.score || a.walk - b.walk);
}
export function reserve(state, { lotId, clientId, people, token }, now = Date.now()) {
  expire(state, now);
  if (!Number.isInteger(people) || people < 1 || people > 9) throw new Error('탑승 인원은 1~9명으로 입력해 주세요.');
  if (state.reservations.some(r => r.clientId === clientId && ['reserved', 'checked_in'].includes(r.status))) throw new Error('이 기기에 진행 중인 예약이 있습니다. 내 예약을 확인해 주세요.');
  const lot = lotsView(state, now).find(l => l.id === lotId);
  if (!lot || lot.status !== 'open' || lot.available < 1 || lot.stale) throw new Error('예약 가능한 자리가 없습니다. 최신 정보를 확인하고 다른 주차장을 선택해 주세요.');
  const r = { token, lotId, clientId, people, status: 'reserved', createdAt: now, expiresAt: now + HOLD_MS };
  state.reservations.push(r);
  return r;
}
export function transition(state, token, action, now = Date.now()) {
  expire(state, now);
  const r = state.reservations.find(r => r.token === token);
  if (!r) throw new Error('예약을 찾을 수 없습니다. QR 또는 예약 코드를 확인해 주세요.');
  const allowed = { cancel: ['reserved'], checkin: ['reserved'], checkout: ['checked_in'] };
  if (!allowed[action]?.includes(r.status)) throw new Error(`처리할 수 없는 예약입니다 (${statusText(r.status)}).`);
  r.status = { cancel: 'cancelled', checkin: 'checked_in', checkout: 'completed' }[action];
  r.updatedAt = now;
  return r;
}
export function updateLot(state, id, { occupied, status }, now = Date.now()) {
  const lot = state.lots.find(l => l.id === id);
  if (!lot) throw new Error('주차장을 찾을 수 없습니다.');
  const view = lotsView(state, now).find(l => l.id === id);
  if (!Number.isInteger(occupied) || occupied < 0 || occupied + view.reserved + view.checkedIn > lot.capacity) throw new Error('일반 차량 수와 QR 예약·입차 차량 수의 합은 수용 대수를 넘을 수 없습니다.');
  if (!['open', 'closed'].includes(status)) throw new Error('올바른 운영 상태를 선택해 주세요.');
  Object.assign(lot, { occupied, status, updatedAt: now });
  return lot;
}
export const statusText = s => ({ reserved: '입차 대기', checked_in: '입차 완료', cancelled: '예약 취소', expired: '시간 만료', completed: '출차 완료' }[s] || '확인 필요');
