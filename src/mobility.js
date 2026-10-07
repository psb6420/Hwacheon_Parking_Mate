import L from 'leaflet';
import { entryStatus, FRESH_MS, distance } from './location.js';
import { fetchRoute, guidance, instruction } from './navigation.js';

const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const meters=n=>n>=1000?`${(n/1000).toFixed(1)} km`:`${Math.round(n)} m`;
let position, watch, armed=false, issuing=false, people=3, accessible=false, message='위치 확인을 시작하면 화천군 진입 후 QR을 자동 발급합니다.';
let navLot, navToken, navRoute, navMap, routeLayer, locationMarker, navigating=false, routing=false, generation=0, lastRequest=0, voice=false, lastSpoken='', locationError=false;
let hooks;
export function configureMobility(options) { hooks=options; }
export function arrivalPanel() {
  return `<section class="arrival-panel"><div><p class="eyebrow">ARRIVE · AUTO MATCH · QR</p><h2>화천군에 도착하면, 주차장 자동 배정</h2><p>현재 위치와 주차 여유를 함께 고려합니다. 주차장은 직접 선택하지 않습니다.</p><p id="entry-status" class="location-status" role="status">${escape(message)}</p></div><form id="auto-form"><label class="field">탑승 인원<select name="people" ${armed?'disabled':''}>${Array.from({length:9},(_,i)=>`<option value="${i+1}" ${people===i+1?'selected':''}>${i+1}명</option>`).join('')}</select></label><label class="checkbox"><input name="accessible" type="checkbox" ${accessible?'checked':''} ${armed?'disabled':''}> 보행 편의 구역 필요</label><label class="checkbox"><input name="consent" type="checkbox" required ${armed?'checked disabled':''}> 위치 확인 및 시연용 자동 배정에 동의</label><button class="primary wide" ${armed || issuing?'disabled':''}>${armed?'화천군 진입 확인 중':'위치 확인 · 자동 배정 시작'}</button>${watch!==undefined?'<button type="button" class="text-btn" data-mobility="stop">위치 확인 중지</button>':''}</form><p class="note arrival-note">화천군 밖에서는 QR을 발급하지 않습니다. 이 페이지가 열린 동안 위치를 확인하며, 위치 좌표는 저장하지 않습니다. 안내 시작 시 현재 위치와 배정 구역 좌표가 OSRM 경로 서비스에 전달됩니다. 경계·GPS 오차가 있으면 군 안쪽에서 재확인합니다.</p></section>`;
}
export function navigationPanel(ticket, lot) {
  if(!lot || ticket?.status!=='reserved') return '';
  return `<section class="navigation-panel panel"><p class="eyebrow">ASSIGNED PARKING · NAVIGATION</p><h2>배정된 주차장으로 안내</h2><p>${escape(lot.name)} · 차량 경로</p><div class="two-buttons"><button class="primary" data-mobility="navigate">${navigating?'경로 다시 확인':'내비게이션 시작'}</button><button class="secondary" data-mobility="voice">음성 ${voice?'켜짐':'꺼짐'}</button></div><p id="nav-status" role="status">${navigating?'최신 GPS 위치를 확인합니다.':'위치 권한을 허용하면 도로 경로와 방향을 안내합니다.'}</p><div id="navigation-map" ${navigating?'':'hidden'} aria-label="배정 주차장까지의 도로 경로"></div><div id="nav-guidance" aria-live="polite"></div><a class="secondary wide" href="https://map.kakao.com/link/to/${encodeURIComponent(lot.name)},${lot.lat},${lot.lng}" target="_blank" rel="noopener noreferrer">카카오맵에서 배정 주차장 길찾기</a>${navigating?'<button class="text-btn" data-mobility="end">안내 종료</button>':''}<p class="note">OSRM · OpenStreetMap 도로 경로입니다. 실시간 교통·통제는 반영하지 않습니다. 목적지는 시범 주차 구역이며 실제 현장 안내로 사용할 수 없습니다.</p></section>`;
}
function updateMessage(text) { message=text; const node=document.querySelector('#entry-status'); if(node)node.textContent=text; }
function usable() { return position && Date.now()-position.timestamp<=FRESH_MS && position.accuracy<=100 && !locationError; }
function stopWatch() { if(watch!==undefined)navigator.geolocation.clearWatch(watch); watch=undefined; }
function stopNavigation() { navigating=false; generation++; routing=false; navRoute=null; navLot=null; navMap?.remove(); navMap=null; window.speechSynthesis?.cancel(); lastSpoken=''; if(!armed)stopWatch(); }
function ensureWatch() {
  if(!navigator.geolocation)throw new Error('이 브라우저는 위치 확인을 지원하지 않습니다.');
  if(watch!==undefined)return;
  locationError=false;
  watch=navigator.geolocation.watchPosition(async p=>{
    position={lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy,timestamp:p.timestamp}; locationError=false;
    if(armed && !issuing) {
      const gate=entryStatus(position); updateMessage(gate.message);
      if(gate.allowed) {
        issuing=true;
        try { const r=await hooks.reserve(position,people,accessible); armed=false; stopWatch(); updateMessage('화천군 진입 확인 · QR 자동 배정 완료'); await hooks.assigned(r); }
        catch(e) { armed=false; stopWatch(); updateMessage(e.message); hooks.toast(e.message); hooks.render(); }
        finally { issuing=false; }
      }
    }
    if(navigating) {
      if(!usable()) { showNavStatus('GPS 정확도가 낮습니다. 최신 위치를 기다립니다.'); window.speechSynthesis?.cancel(); return; }
      if(!navRoute) await route(); else updateNavigation();
    }
  },e=>{
    locationError=true;
    const text=e.code===1?'위치 권한이 필요합니다. 브라우저에서 위치를 허용한 뒤 다시 시작해 주세요.':'GPS 위치를 확인하지 못했습니다. 실외에서 다시 확인해 주세요.';
    updateMessage(text); showNavStatus(text); window.speechSynthesis?.cancel();
    if(e.code===1) { armed=false; stopNavigation(); stopWatch(); hooks.render(); }
  },{enableHighAccuracy:true,maximumAge:0,timeout:15000});
}
function showNavStatus(text) { const n=document.querySelector('#nav-status'); if(n)n.textContent=text; }
async function route() {
  if(routing || !navigating || !usable() || Date.now()-lastRequest<30000)return;
  routing=true; lastRequest=Date.now(); const version=generation, destination=navLot;
  showNavStatus('도로 경로를 계산하고 있습니다.');
  try {
    const result=await fetchRoute(position,destination);
    if(version!==generation || !navigating)return;
    navRoute=result; lastSpoken=''; drawRoute(); updateNavigation();
  } catch(e) { if(version===generation) { navRoute=null; routeLayer?.remove(); showNavStatus(e.message+' 카카오맵 길찾기도 이용할 수 있습니다.'); const n=document.querySelector('#nav-guidance'); if(n)n.textContent='경로를 확인할 수 없어 방향 안내를 중지했습니다.'; window.speechSynthesis?.cancel(); } }
  finally { if(version===generation)routing=false; }
}
function drawRoute() {
  const container=document.querySelector('#navigation-map'); if(!container || !navigating)return;
  container.hidden=false;
  if(!navMap) {
    navMap=L.map(container,{scrollWheelZoom:false}).setView([navLot.lat,navLot.lng],14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(navMap);
    L.circleMarker([navLot.lat,navLot.lng],{radius:10,color:'#126758'}).addTo(navMap).bindTooltip('배정 주차장');
    locationMarker=L.circleMarker([position.lat,position.lng],{radius:8,color:'#fff',fillColor:'#3266e3',fillOpacity:1}).addTo(navMap);
  }
  routeLayer?.remove();
  routeLayer=L.geoJSON(navRoute.geometry,{style:{color:'#3266e3',weight:6,opacity:.8}}).addTo(navMap);
  navMap.fitBounds(routeLayer.getBounds(),{padding:[28,28]});
}
function updateNavigation() {
  if(!navRoute || !navigating || !usable())return;
  const g=guidance(navRoute,position); locationMarker?.setLatLng([position.lat,position.lng]);
  const end=navRoute.geometry.coordinates.at(-1), destinationDistance=distance(position,{lat:end[1],lng:end[0]});
  const arrived=destinationDistance<40 && g.remaining<60;
  if(g.distance>Math.max(80,position.accuracy*2)) {
    showNavStatus('경로 이탈 · 도로 경로를 다시 확인합니다.');
    const node=document.querySelector('#nav-guidance'); if(node)node.textContent='재탐색 중에는 기존 방향 안내를 따르지 마세요.';
    window.speechSynthesis?.cancel(); route(); return;
  }
  const text=arrived?'배정된 주차장 인근 도착 · 운영자에게 QR을 보여 주세요.':`${meters(g.turnDistance)} 후 ${instruction(g.next)}`;
  showNavStatus(`GPS 확인 · 정확도 약 ${Math.round(position.accuracy)} m`);
  const node=document.querySelector('#nav-guidance');
  if(node)node.innerHTML=`<strong>${escape(text)}</strong><div class="nav-metrics"><span>남은 거리 <b>${meters(g.remaining)}</b></span><span>예상 시간 <b>${Math.max(arrived?0:1,Math.ceil(navRoute.duration*(g.remaining/(g.total || 1))/60))}분</b></span></div>`;
  const spoken=`${g.next?.maneuver.location.join(',')}:${arrived}:${g.turnDistance<100}`;
  if(voice && spoken!==lastSpoken) { window.speechSynthesis.cancel(); const utterance=new SpeechSynthesisUtterance(text); utterance.lang='ko-KR'; window.speechSynthesis.speak(utterance); lastSpoken=spoken; }

}
export function mountMobility(ticket, lot) {
  if(navigating && (ticket?.token!==navToken || ticket?.status!=='reserved'))stopNavigation();
  navMap?.remove(); navMap=null;
  if(navigating && navRoute && lot) { drawRoute(); updateNavigation(); }
}
document.addEventListener('submit',e=>{
  if(e.target.id!=='auto-form')return;
  e.preventDefault(); if(issuing)return;
  const data=new FormData(e.target); people=Number(data.get('people')); accessible=data.has('accessible');
  if(!data.has('consent'))return;
  if(hooks.active()) { hooks.toast('진행 중인 QR이 있습니다. 내 QR 예약을 확인해 주세요.'); return; }
  try { armed=true; updateMessage('위치 권한과 최신 GPS를 확인합니다. 화천군 밖에서는 진입을 기다립니다.'); ensureWatch(); hooks.render(); }
  catch(error) { armed=false; updateMessage(error.message); hooks.toast(error.message); }
});
document.addEventListener('click',e=>{
  const action=e.target.closest('[data-mobility]')?.dataset.mobility; if(!action)return;
  if(action==='stop') { armed=false; stopNavigation(); stopWatch(); updateMessage('위치 확인을 중지했습니다. 다시 시작하면 진입 여부를 확인합니다.'); hooks.render(); }
  if(action==='end') { stopNavigation(); hooks.render(); }
  if(action==='voice') {
    if(!window.speechSynthesis || !window.SpeechSynthesisUtterance)return hooks.toast('이 브라우저는 음성 안내를 지원하지 않습니다.');
    voice=!voice; lastSpoken=''; if(!voice)window.speechSynthesis.cancel(); e.target.textContent=`음성 ${voice?'켜짐':'꺼짐'}`; if(voice)updateNavigation();
  }
  if(action==='navigate') {
    const target=hooks.destination(); if(!target)return hooks.toast('유효한 QR 배정이 필요합니다.');
    if(navigating && Date.now()-lastRequest<30000)return hooks.toast('경로 확인은 30초 간격으로 가능합니다.');
    stopNavigation(); navLot=target.lot; navToken=target.ticket.token; navigating=true; generation++;
    try { ensureWatch(); hooks.render(); if(usable())route(); } catch(error) { stopNavigation(); hooks.toast(error.message); hooks.render(); }
  }
});
setInterval(()=>{
  if(armed && !issuing && position && !entryStatus(position).allowed)updateMessage(locationError?message:entryStatus(position).message);
  if(navigating && !usable()) { showNavStatus('최신 GPS를 기다립니다. 현재 방향 안내가 일시 중지되었습니다.'); const n=document.querySelector('#nav-guidance'); if(n)n.textContent='현재 위치가 확인되면 안내를 재개합니다.'; window.speechSynthesis?.cancel(); }
},1000);
window.addEventListener('pagehide',()=>{armed=false;stopNavigation();stopWatch();});
