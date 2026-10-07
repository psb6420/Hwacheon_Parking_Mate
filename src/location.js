import boundary from './data/hwacheon-boundary.json' with { type: 'json' };
export { boundary };
export const FRESH_MS = 30000;
export function distance(a, b) {
  const rad = Math.PI / 180, dlat = (b.lat-a.lat)*rad, dlng = (b.lng-a.lng)*rad;
  const h = Math.sin(dlat/2)**2 + Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlng/2)**2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function segmentProjection(p, a, b) {
  const scale = Math.cos(p.lat * Math.PI / 180), x = (p.lng-a.lng)*scale, y = p.lat-a.lat;
  const dx = (b.lng-a.lng)*scale, dy = b.lat-a.lat;
  const t = Math.max(0, Math.min(1, (x*dx+y*dy)/(dx*dx+dy*dy || 1)));
  const point = { lat:a.lat+(b.lat-a.lat)*t, lng:a.lng+(b.lng-a.lng)*t };
  return { point, t, distance:distance(p,point) };
}
function inRing(p, ring) {
  let inside = false;
  for (let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const [xi,yi]=ring[i], [xj,yj]=ring[j];
    if ((yi>p.lat)!==(yj>p.lat) && p.lng<(xj-xi)*(p.lat-yi)/(yj-yi)+xi) inside=!inside;
  }
  return inside;
}
export function entryStatus(p, now=Date.now()) {
  if (!p || ![p.lat,p.lng,p.accuracy,p.timestamp].every(Number.isFinite) || Math.abs(p.lat)>90 || Math.abs(p.lng)>180 || p.accuracy<0) return { allowed:false, code:'missing', message:'위치 확인을 시작해 주세요.' };
  if (now-p.timestamp>FRESH_MS || p.timestamp>now+10000) return {allowed:false,code:'stale',message:'현재 위치를 다시 확인하고 있습니다. 최신 GPS가 필요합니다.'};
  if (p.accuracy>100) return {allowed:false,code:'accuracy',message:'위치가 불확실합니다. 실외에서 GPS 정확도를 높여 주세요.'};
  const polygons=boundary.geometry.type==='Polygon' ? [boundary.geometry.coordinates] : boundary.geometry.coordinates;
  const inside=polygons.some(rings=>inRing(p,rings[0]) && !rings.slice(1).some(r=>inRing(p,r)));
  if (!inside) return {allowed:false,code:'outside',message:'화천군 진입 대기 · 진입이 확인되면 자동 배정합니다.'};
  let edge=Infinity;
  for (const rings of polygons) for (const ring of rings) for(let i=1;i<ring.length;i++) edge=Math.min(edge,segmentProjection(p,{lng:ring[i-1][0],lat:ring[i-1][1]},{lng:ring[i][0],lat:ring[i][1]}).distance);
  // Simplified boundary has ~55m tolerance; do not issue in its uncertainty band.
  if (edge<=p.accuracy+60) return {allowed:false,code:'boundary',message:'군 경계 부근입니다. 화천군 안쪽에서 위치를 다시 확인합니다.'};
  return {allowed:true,code:'inside',message:'화천군 진입 확인 · 자동 배정 가능'};
}
