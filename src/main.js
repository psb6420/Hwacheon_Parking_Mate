import L from 'leaflet';
import QRCode from 'qrcode';
import 'leaflet/dist/leaflet.css';
import './style.css';
import { FESTIVAL } from './catalog.js';
import { rankLots, statusText } from './domain.js';
import { service, isRemote, setAdminKey } from './store.js';
import { configureMobility, arrivalPanel, navigationPanel, mountMobility } from './mobility.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const number = n => n.toLocaleString('ko-KR');
const icons = { pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>', arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>', walk: '<circle cx="14" cy="4" r="2"/><path d="m7 21 4-8m5 8-3-7V9m-7 3 4-5 4 1 3 4h3"/>', bus: '<rect x="5" y="3" width="14" height="16" rx="3"/><path d="M5 11h14M8 19v3m8-3v3M8 15h1m6 0h1"/>', qr: '<path d="M3 3h6v6H3zm12 0h6v6h-6zM3 15h6v6H3zm12 0h2v2h-2zm4 4h2v2h-2zm-4 2v-2m6-4h-2"/>', sliders: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>', search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>', refresh: '<path d="M20 7a9 9 0 1 0 1 8M20 3v5h-5"/>', check: '<path d="m5 12 4 4L20 5"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>', location: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4"/>' };
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.pin}</svg>`;
let lots = [], tab = ['map', 'ticket', 'guide', 'admin'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'map';
let preference = 'balanced', accessible = false, query = '', selected = null, map, markerLayer, userPosition;
let lastToken = localStorage.getItem('hwacheon-ticket') || '', ticket = null, adminEvents = [], adminReady = !isRemote, error = '', busy = false, stream;
const badges = l => `<span class="badge ${l.label === '여유' ? 'good' : l.label === '혼잡' ? 'warn' : 'muted'}"><i></i>${l.label}</span>`;
const filtered = () => rankLots(lots.filter(l => `${l.name} ${l.area} ${l.id}`.toLowerCase().includes(query.toLowerCase())), preference, accessible);
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toast.timer); toast.timer = setTimeout(() => $('#toast').classList.remove('visible'), 4500); }
function shell() {
  if (map) { map.remove(); map = null; }
  $('#app').innerHTML = `<header><a class="brand" href="#map"><span class="brand-mark">P<span>↗</span></span><span>화천 <b>Parking Mate</b><small>KNU RE:RISE · LOCAL MOBILITY</small></span></a><nav aria-label="주 메뉴">${[['map','자동 주차 배정'],['ticket','내 QR 예약'],['guide','이용 안내'],['admin','운영자']].map(([key,label]) => `<a href="#${key}" ${tab === key ? 'aria-current="page"' : ''}>${label}</a>`).join('')}</nav><span class="project-badge">RE:RISE 7</span></header>
  <div class="demo-strip">${icon('info')} <span><b>시범 서비스</b> · 주차장 위치·잔여면·셔틀은 예시입니다. 실제 주차 예약이나 현장 안내로 사용할 수 없습니다.</span><span class="mode">${isRemote ? '공유 서버 연결' : '이 기기에서 체험'}</span></div>
  <main id="main">${error ? `<div class="error" role="alert">${esc(error)} <button data-action="retry">다시 시도</button></div>` : ''}${tab === 'map' ? mapPage() : tab === 'ticket' ? ticketPage() : tab === 'guide' ? guidePage() : adminPage()}</main>
  <footer><span>화천에서 만나는 더 여유로운 시작.</span><span>KNU RE:RISE 7팀 · 축제 주차 분산 프로젝트</span></footer>`;
  if (tab === 'map') { createMap(); renderCards(); }
  mountMobility(ticket, lots.find(l=>l.id===ticket?.lotId));
  if (tab === 'ticket' && ticket?.status === 'reserved') QRCode.toCanvas($('#ticket-qr'), `HPM:${ticket.token}`, { width: 204, margin: 2, color: { dark: '#123d38', light: '#ffffff' } }).catch(() => toast('QR 표시에 실패했습니다. 예약 코드를 이용해 주세요.'));
}
function mapPage() {
  const eligible = lots.filter(l => l.status === 'open' && !l.stale);
  return `<section class="intro"><div><p class="eyebrow">HWACHEON · PARK & ENJOY</p><h1>축제로 가는 길,<br>주차부터 <em>가볍게.</em></h1><p class="intro-copy">화천군에 진입하면 주차장을 자동 배정하고 QR을 발급합니다.</p></div><div class="summary"><div><span>시범 주차 구역</span><strong>${lots.length}<small>곳</small></strong></div><div><span>예약 가능 · 예시</span><strong>${number(eligible.reduce((sum,l) => sum + l.available, 0))}<small>면</small></strong></div><p><i></i> 예시 데이터 · 자동 갱신 15초</p></div></section>
  ${arrivalPanel()}<section class="workspace" aria-label="주차장 탐색"><div class="finder"><div class="finder-title"><h2>배정 대상 구역 살펴보기</h2><button class="icon-btn" data-action="retry" aria-label="주차 정보 새로고침">${icon('refresh')}</button></div><label class="search">${icon('search')}<input id="search" type="search" value="${esc(query)}" placeholder="주차장 이름 또는 구역 검색" aria-label="주차장 검색"></label><div class="preferences" role="group" aria-label="추천 기준">${[['balanced','분산 추천'],['walk','가까운 도보'],['shuttle','셔틀 우선']].map(([key,label]) => `<button class="${preference === key ? 'active' : ''}" data-pref="${key}" aria-pressed="${preference === key}">${label}</button>`).join('')}</div><label class="checkbox"><input id="accessible" type="checkbox" ${accessible ? 'checked' : ''}> 보행 편의 구역만 보기 <span>예시</span></label><div id="results" class="results"></div><div id="cards" class="cards"></div></div><div class="map-panel"><div id="map" aria-label="화천 시범 주차장 지도"></div><div class="map-label">${icon('pin')} 화천 산천어축제 주변 <span>시범 위치</span></div><div class="map-tools"><button class="icon-btn" data-action="locate" aria-label="내 위치 보기">${icon('location')}</button><button class="icon-btn" data-action="fit" aria-label="전체 주차장 보기">${icon('pin')}</button></div><div class="map-note"><span class="festival-dot"></span> 축제장 기준점 <span class="lot-dot"></span> 예시 주차 구역 <small>경로·소요 시간은 현장 확인 전 예시입니다.</small></div></div></section>
  <section class="steps-strip"><div><span>01</span><p><b>위치 확인 시작</b><small>화천군 진입까지 위치 확인</small></p></div><div><span>02</span><p><b>자동 매칭 · QR 발급</b><small>주차 여유와 현재 위치로 자동 배정</small></p></div><div><span>03</span><p><b>내비게이션 · 입차</b><small>배정 구역으로 이동 후 QR 확인</small></p></div></section>`;
}
function renderCards() {
  const rows = filtered();
  $('#results').innerHTML = `<b>${rows.length}개 구역</b><span>목록 정렬용 · 배정은 자동</span>`;
  $('#cards').innerHTML = rows.length ? rows.map((l, i) => `<article class="lot-card ${selected === l.id ? 'selected' : ''}" data-lot="${l.id}"><div class="lot-top"><span class="lot-id">${l.id}</span><span class="lot-area">${l.area}</span>${badges(l)}</div><h3><button data-detail="${l.id}">${l.name} ${icon('arrow')}</button></h3>${i === 0 && l.eligible ? '<p class="recommend">분산 현황 참고 구역</p>' : ''}<div class="lot-stats"><span><b>${l.available}</b> / ${l.capacity}면 <small>예시</small></span><span>${icon('walk')} ${l.walk}분${l.shuttle ? ` &nbsp; ${icon('bus')} 셔틀` : ''}</span></div><div class="capacity-bar"><span style="width:${100 * (1 - l.available / l.capacity)}%"></span></div><p class="reason">${l.reason}</p><div class="card-actions"><button class="secondary" data-detail="${l.id}">상세 안내</button><span class="auto-label">진입 후 자동 배정</span></div></article>`).join('') : '<div class="empty"><h3>조건에 맞는 구역이 없어요</h3><p>검색어나 보행 편의 필터를 바꿔 보세요.</p></div>';
  if (markerLayer) {
    markerLayer.clearLayers();
    for (const l of rows) L.marker([l.lat,l.lng], { icon: L.divIcon({ className: '', html: `<button class="map-pin ${l.eligible ? '' : 'full'} ${l.id === selected ? 'chosen' : ''}" aria-label="${l.name} 상세 안내"><b>${l.id}</b><span>${l.label === '여유' || l.label === '혼잡' ? l.available + '면' : l.label}</span></button>`, iconSize: [94, 40], iconAnchor: [47, 45] }) }).addTo(markerLayer).on('click', () => showDetail(l.id));
  }
}
function createMap() {
  map = L.map('map', { zoomControl: false, scrollWheelZoom: false }).setView([38.1036,127.7068], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);
  L.marker([FESTIVAL.lat,FESTIVAL.lng], { icon: L.divIcon({ className: '', html: '<div class="festival-marker">축제장 <small>기준점</small></div>', iconSize: [100,36], iconAnchor:[50,0] }) }).addTo(map);
  if (userPosition) L.circleMarker(userPosition, { radius: 8, color: '#fff', fillColor:'#3266e3', fillOpacity:1 }).addTo(map).bindTooltip('내 위치');
  if (selected) { const l = lots.find(l => l.id === selected); if (l) map.panTo([l.lat,l.lng]); }
}
function showDialog(html) { $('#dialog').innerHTML = `<button class="close icon-btn" data-action="close" aria-label="닫기">${icon('close')}</button>${html}`; $('#dialog').showModal(); }
function showDetail(id) {
  const l = lots.find(l => l.id === id); if (!l) return;
  selected = id; if (tab === 'map') { renderCards(); map.panTo([l.lat,l.lng]); }
  showDialog(`<p class="eyebrow">PARKING GUIDE · ${l.id}</p><h2 id="dialog-title">${l.name}</h2>${badges(l)}<p>${l.note}</p><dl class="details"><div><dt>주차 여유</dt><dd>${l.available} / ${l.capacity}면</dd></div><div><dt>도보 이동</dt><dd>약 ${l.walk}분</dd></div><div><dt>운영시간</dt><dd>${l.hours}</dd></div><div><dt>정보 갱신</dt><dd>${new Date(l.updatedAt).toLocaleTimeString('ko-KR')}${l.stale ? ' · 확인 필요' : ''}</dd></div></dl><div class="shuttle-info">${icon(l.shuttle ? 'bus' : 'walk')}<div><b>${l.shuttle ? '셔틀로 축제장까지' : '도보로 축제장까지'}</b><p>${l.shuttle ? `${l.shuttle.stop} → 축제장<br>${l.shuttle.interval}분 간격 · 탑승 약 ${l.shuttle.ride}분<br>${l.shuttle.hours}` : `주차 후 축제장까지 약 ${l.walk}분 이동`}</p></div></div><p class="note">위치·요금·동선·운영시간은 실제 운영 정보가 아닌 예시입니다. 실제 방문 전 공식 안내를 확인하세요.</p><p class="note">주차장 선택 예약은 지원하지 않습니다. 위치 확인을 시작하면 화천군 진입 후 구역을 자동 배정합니다.</p>`);
}
function ticketPage() {
  if (!ticket) return `<section class="page-heading"><p class="eyebrow">MY PARKING PASS</p><h1>내 QR 예약</h1></section><section class="empty panel">${icon('qr')}<h2>아직 예약이 없어요</h2><p>위치 확인을 시작하고 화천군에 진입하면 QR이 자동 배정됩니다.</p><a class="primary" href="#map">주차장 찾기 ${icon('arrow')}</a></section>`;
  const l = lots.find(l => l.id === ticket.lotId);
  const active = ticket.status === 'reserved';
  return `<section class="page-heading"><p class="eyebrow">MY PARKING PASS</p><h1>${active?'자동 배정, 완료.':statusText(ticket.status)}</h1><p>${active?'배정된 구역으로 이동하고 운영자에게 QR을 보여 주세요.':'QR 상태를 확인해 주세요.'}</p></section><section class="ticket-layout"><article class="ticket"><div class="ticket-head"><span>HWACHEON PARKING MATE</span><b>시연용</b></div><div class="ticket-body"><span class="badge good">${statusText(ticket.status)}</span><h2>${l?.name || ticket.lotId}</h2>${active ? '<canvas id="ticket-qr" aria-label="입차 확인 QR 코드"></canvas>' : `<div class="ticket-icon">${icon(ticket.status === 'checked_in' ? 'check' : 'info')}</div>`}<p class="countdown" id="countdown">${active ? remaining(ticket.expiresAt) : statusText(ticket.status)}</p><p class="note">${isRemote ? 'QR을 운영자에게 보여 주세요.' : '이 브라우저에서만 유효한 시연 예약입니다.'}</p><dl class="details"><div><dt>탑승 인원</dt><dd>${ticket.people}명 · 차량 1대</dd></div><div><dt>입차 기한</dt><dd>${new Date(ticket.expiresAt).toLocaleTimeString('ko-KR')}</dd></div></dl><label class="field">예약 코드<input readonly value="${esc(ticket.token)}" aria-label="내 예약 코드"></label><button class="secondary wide" data-action="copy">예약 코드 복사</button>${active ? '<button class="text-btn danger" data-action="cancel">예약 취소</button>' : '<a class="primary wide" href="#map">주차장 다시 찾기</a>'}</div></article><aside class="ticket-aside">${navigationPanel(ticket,l)}<p class="eyebrow">NEXT STEP</p><h2>주차한 다음은<br>축제를 즐길 시간.</h2><div class="shuttle-info">${icon('walk')}<div><b>도보 약 ${l?.walk || '—'}분</b><p>이동 시간은 시연용 예시입니다.</p></div></div>${l?.shuttle ? `<div class="shuttle-info">${icon('bus')}<div><b>셔틀 ${l.shuttle.interval}분 간격</b><p>${l.shuttle.stop}에서 탑승 · 약 ${l.shuttle.ride}분</p></div></div>` : ''}<p class="note">운영 중지나 현장 상황 변경 시 예약이 있어도 운영자 안내를 우선 확인하세요.</p></aside></section>`;
}
function remaining(expires) { const s = Math.max(0,Math.ceil((expires-Date.now())/1000)); return `${Math.floor(s/60)}분 ${String(s%60).padStart(2,'0')}초 남음`; }
function guidePage() { return `<section class="page-heading"><p class="eyebrow">A LITTLE GUIDE FOR A BETTER TRIP</p><h1>주차는 간단하게,<br>축제는 여유롭게.</h1></section><div class="guide-grid">${[['01','위치 확인 시작','위치 권한을 허용하면 화천군 진입 여부를 확인합니다. 군 밖·경계 부근·부정확한 GPS에서는 QR을 발급하지 않습니다. 화면이 열린 동안 확인합니다.'],['02','주차장 자동 배정','화천군 진입을 확인하면 현재 위치와 잔여 비율을 기준으로 이용 가능한 구역을 자동 배정합니다. 운영 중지·만차·오래된 정보는 제외하며 30분 동안 차량 1대의 자리를 확보합니다.'],['03','내비게이션과 QR 입차','내 QR 예약에서 도로 경로·방향·남은 거리·음성 안내를 시작합니다. 경로 이탈 시 재탐색하며 도착 후 운영자가 QR을 확인합니다. GPS 좌표는 저장하지 않습니다.'],['04','운영자 화면 체험','일반 차량 수와 운영 여부를 바꾸고 입차·출차를 처리할 수 있습니다. 시연 모드에서는 같은 브라우저의 정보만 변경됩니다.']].map(([n,t,p])=>`<article class="panel"><span class="step-number">${n}</span><h2>${t}</h2><p>${p}</p></article>`).join('')}</div><section class="panel scope"><h2>지금 체험할 수 있는 범위</h2><p>이 서비스는 KNU RE:RISE 7팀의 화천 축제 주차 분산 검증용 프로토타입입니다. 주차장 이름·위치·수용 대수·셔틀·보행 편의 정보는 전부 예시이며, 공식 주차장과 실제 예약을 의미하지 않습니다.</p><p>수동 정보는 15분이 지나면 ‘확인 필요’로 바뀌고 신규 예약을 막습니다. 운영자 화면에서 현황을 확인·저장하면 다시 예약할 수 있습니다.</p><p>GitHub Pages 체험판은 기기 간 예약을 공유하지 않습니다. 공유 서버를 연결하면 여러 기기의 예약·입차·운영 현황을 함께 관리할 수 있습니다. 실제 운영에는 담당 기관과 데이터·예약 구역·운영 인력 협의가 필요합니다.</p></section>`; }
function adminPage() {
  if (!adminReady) return `<section class="page-heading"><p class="eyebrow">OPERATIONS</p><h1>운영자 인증</h1></section><form id="login-form" class="panel login"><label class="field">운영자 키<input name="key" type="password" required autocomplete="off"></label><p class="note">인증키는 현재 탭의 메모리에만 유지됩니다.</p><button class="primary">연결</button></form>`;
  return `<section class="page-heading admin-heading"><div><p class="eyebrow">OPERATIONS · ${isRemote ? 'SHARED SERVER' : 'LOCAL DEMO'}</p><h1>주차 운영 현황</h1><p>일반 차량 수와 QR 차량을 구분해서 관리합니다.</p></div>${!isRemote ? '<button class="secondary" data-action="reset">시연 데이터 초기화</button>' : '<button class="secondary" data-action="logout">운영자 로그아웃</button>'}</section><div class="admin-grid"><section class="panel"><h2>구역별 현황</h2><p class="note">일반 차량 수에는 QR로 입차한 차량을 제외하세요. 저장 시 갱신 시간이 함께 업데이트됩니다.</p><div class="table-scroll"><table><thead><tr><th>구역</th><th>일반 차량</th><th>QR 대기 / 입차</th><th>잔여</th><th>운영</th><th>저장</th></tr></thead><tbody>${lots.map(l=>`<tr><th>${l.id}<small>${l.name}</small></th><td><input form="lot-${l.id}" name="occupied" type="number" min="0" max="${l.capacity-l.reserved-l.checkedIn}" value="${l.occupied}" aria-label="${l.id} 일반 차량 수" required></td><td>${l.reserved} / ${l.checkedIn}</td><td>${l.available}<small>${l.label}</small></td><td><select form="lot-${l.id}" name="status" aria-label="${l.id} 운영 상태"><option value="open" ${l.status==='open'?'selected':''}>운영</option><option value="closed" ${l.status==='closed'?'selected':''}>중지</option></select></td><td><form id="lot-${l.id}" class="lot-form" data-id="${l.id}"><button class="secondary" type="submit">저장</button></form></td></tr>`).join('')}</tbody></table></div></section><section class="panel scan-panel"><span class="mini-icon">${icon('qr')}</span><h2>입차·출차 확인</h2><p>QR을 스캔하거나 예약 코드를 입력하세요.</p><form id="scan-form"><label class="field">예약 코드<input name="token" id="scan-token" placeholder="HPM:… 또는 예약 코드" required autocomplete="off"></label><div class="two-buttons"><button class="primary" name="action" value="checkin">입차 확인</button><button class="secondary" name="action" value="checkout">출차 확인</button></div></form><button class="text-btn" data-action="camera">카메라로 QR 스캔</button><div id="camera-area"></div><p class="note">이미 처리되었거나 만료된 QR은 다시 입차할 수 없습니다.</p></section></div><section class="panel event-panel"><h2>최근 운영 기록</h2>${adminEvents.length ? `<ul>${adminEvents.slice(0,10).map(e=>`<li><time>${new Date(e.at).toLocaleTimeString('ko-KR')}</time>${esc(e.text)}</li>`).join('')}</ul>` : '<p>상태 변경과 입차·출차 기록이 여기에 표시됩니다.</p>'}</section>`;
}
async function refresh(render = true) {
  try {
    const data = await service.lots(); lots = data.lots; error = '';
    if (lastToken) { try { ticket = await service.ticket(lastToken); } catch (e) { ticket = null; if (tab === 'ticket') toast(e.message); } }
    if (tab === 'admin' && adminReady) { try { adminEvents = (await service.admin()).events; } catch(e) { adminReady = false; toast(e.message); } }
  } catch(e) { error = '주차 정보를 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.'; }
  if (render) shell();
}
async function run(fn) { if (busy) return; busy = true; try { await fn(); } catch (e) { toast(e.message); } finally { busy = false; } }
function stopCamera() { stream?.getTracks().forEach(t => t.stop()); stream = null; if ($('#camera-area')) $('#camera-area').innerHTML = ''; }
async function camera() {
  if (!('BarcodeDetector' in window)) return toast('이 브라우저는 카메라 QR 인식을 지원하지 않습니다. 예약 코드를 입력해 주세요.');
  const formats = await BarcodeDetector.getSupportedFormats(); if (!formats.includes('qr_code')) return toast('QR 인식을 지원하지 않습니다. 예약 코드를 입력해 주세요.');
  stopCamera();
  stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode:'environment' } });
  if (tab !== 'admin') { stopCamera(); return; }
  $('#camera-area').innerHTML = '<video autoplay playsinline muted></video><button class="secondary" data-action="stop-camera">카메라 닫기</button>';
  const video = $('#camera-area video'); video.srcObject = stream; await video.play();
  const detector = new BarcodeDetector({ formats:['qr_code'] });
  async function scan() { if (!stream || tab !== 'admin') return; try { const codes = await detector.detect(video); if (codes.length) { $('#scan-token').value = codes[0].rawValue.replace(/^HPM:/,''); stopCamera(); toast('QR을 읽었습니다. 입차 또는 출차를 선택하세요.'); return; } } catch { stopCamera(); toast('카메라 인식에 실패했습니다. 예약 코드를 입력하세요.'); return; } setTimeout(scan,300); } scan();
}
document.addEventListener('click', e => {
  const target = e.target.closest('button'); if (!target) return;
  if (target.dataset.pref) { preference = target.dataset.pref; document.querySelectorAll('[data-pref]').forEach(b=> { b.classList.toggle('active', b.dataset.pref === preference); b.setAttribute('aria-pressed', b.dataset.pref===preference); }); renderCards(); return; }
  if (target.dataset.detail) return showDetail(target.dataset.detail);
  run(async () => {
    switch (target.dataset.action) {
      case 'close': $('#dialog').close(); break;
      case 'retry': await refresh(); toast(error || '최신 상태를 확인했습니다.'); break;
      case 'copy': try { await navigator.clipboard.writeText(ticket.token); toast('예약 코드를 복사했습니다.'); } catch { toast('예약 코드 입력란에서 직접 복사해 주세요.'); } break;
      case 'cancel': showDialog('<h2 id="dialog-title">예약을 취소할까요?</h2><p>확보한 자리가 다른 방문객에게 열립니다.</p><button class="primary wide" data-action="confirm-cancel">예약 취소하기</button>'); break;
      case 'confirm-cancel': await service.action(ticket.token,'cancel'); $('#dialog').close(); await refresh(); toast('예약을 취소했습니다.'); break;
      case 'reset': showDialog('<h2 id="dialog-title">시연 데이터를 초기화할까요?</h2><p>이 브라우저의 예시 예약과 운영 기록이 초기화됩니다.</p><button class="primary wide" data-action="confirm-reset">초기화</button>'); break;
      case 'confirm-reset': await service.reset(); lastToken=''; ticket=null; localStorage.removeItem('hwacheon-ticket'); $('#dialog').close(); await refresh(); toast('시연 데이터를 초기화했습니다.'); break;
      case 'logout': stopCamera(); setAdminKey(''); adminReady=false; shell(); break;
      case 'camera': await camera(); break;
      case 'stop-camera': stopCamera(); break;
      case 'fit': map.fitBounds(lots.map(l=>[l.lat,l.lng]),{padding:[65,65]}); break;
      case 'locate': if (!navigator.geolocation) { toast('위치를 지원하지 않는 브라우저입니다.'); break; } navigator.geolocation.getCurrentPosition(p=>{ userPosition=[p.coords.latitude,p.coords.longitude]; if (map) { L.circleMarker(userPosition,{radius:8,color:'#3266e3'}).addTo(map); map.setView(userPosition,14); } toast('현재 위치는 이 화면에서만 사용됩니다.'); },()=>toast('위치 권한이나 GPS를 확인해 주세요. 주차장 검색은 계속 이용할 수 있습니다.'),{timeout:10000}); break;
    }
  });
});
document.addEventListener('input', e => { if (e.target.id==='search') { query=e.target.value; renderCards(); } });
document.addEventListener('change', e => { if (e.target.id==='accessible') { accessible=e.target.checked; renderCards(); } });
document.addEventListener('submit', e => {
  e.preventDefault(); const form = e.target; const data = new FormData(form); const action=e.submitter?.value;
  run(async () => {
    if (form.classList.contains('lot-form')) { await service.update(form.dataset.id,{occupied:Number(data.get('occupied')),status:data.get('status')}); await refresh(); toast('주차 현황을 저장했습니다.'); }
    if (form.id==='login-form') { setAdminKey(String(data.get('key'))); await service.admin(); adminReady=true; await refresh(); }
    if (form.id==='scan-form') { const token=String(data.get('token')).trim().replace(/^HPM:/,''); await service.action(token,action); stopCamera(); await refresh(); toast(action==='checkin'?'입차를 확인했습니다.':'출차를 확인했습니다.'); }
  });
});
window.addEventListener('hashchange',()=>{ stopCamera(); if ($('#dialog').open) $('#dialog').close(); tab=['map','ticket','guide','admin'].includes(location.hash.slice(1))?location.hash.slice(1):'map'; refresh(); window.scrollTo({top:0}); });
window.addEventListener('storage',()=>{ if (!$('#dialog').open && !['INPUT','SELECT'].includes(document.activeElement.tagName)) refresh(); });
setInterval(()=> { if (ticket?.status==='reserved' && $('#countdown')) { $('#countdown').textContent=remaining(ticket.expiresAt); if (ticket.expiresAt<=Date.now()) refresh(); } },1000);
setInterval(async()=> { if ($('#dialog').open || stream || busy || ['INPUT','SELECT'].includes(document.activeElement.tagName)) return; const before=JSON.stringify([lots,ticket,error]), status=ticket?.status, navigating=$('#navigation-map') && !$('#navigation-map').hidden; await refresh(false); if (before!==JSON.stringify([lots,ticket,error]) && (!navigating || status!==ticket?.status || error)) shell(); },15000);
await refresh();

configureMobility({
  reserve: (position, people, accessible)=>service.reserveAuto(position, people, accessible),
  active: ()=>ticket && ['reserved','checked_in'].includes(ticket.status) && (ticket.status==='checked_in' || ticket.expiresAt>Date.now()),
  destination: ()=>ticket?.status==='reserved' && ticket.expiresAt>Date.now() && lots.find(l=>l.id===ticket.lotId) ? {ticket,lot:lots.find(l=>l.id===ticket.lotId)} : null,
  assigned: async r=>{ lastToken=r.token; localStorage.setItem('hwacheon-ticket',lastToken); ticket=r; await refresh(false); location.hash='ticket'; if(tab==='ticket')shell(); toast('화천군 진입 확인 · 주차장과 QR을 자동 배정했습니다.'); },
  toast, render:shell
});
