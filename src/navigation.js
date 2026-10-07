import { distance, segmentProjection } from './location.js';
export function instruction(step) {
  const m=step.maneuver || {}, road=step.name ? ` · ${step.name}` : '';
  if (m.type==='arrive') return '배정된 주차장 인근 도착';
  if (m.type==='depart') return `도로를 따라 출발${road}`;
  if (['roundabout','rotary','roundabout turn'].includes(m.type)) return `회전교차로 ${step.exit || m.exit || ''}번 출구${road}`;
  const text={'left':'좌회전','right':'우회전','slight left':'왼쪽 방향','slight right':'오른쪽 방향','sharp left':'크게 좌회전','sharp right':'크게 우회전','uturn':'유턴','straight':'직진'}[m.modifier] || '도로를 따라 이동';
  return `${m.type==='exit ramp' ? '출구로 이동 · ' : m.type==='merge' ? '합류 · ' : ''}${text}${road}`;
}
export function progress(route, position) {
  const points=route.geometry.coordinates.map(([lng,lat])=>({lat,lng}));
  let best={distance:Infinity,travelled:0}, total=0;
  for(let i=1;i<points.length;i++) {
    const length=distance(points[i-1],points[i]), p=segmentProjection(position,points[i-1],points[i]);
    if(p.distance<best.distance) best={...p,travelled:total+length*p.t};
    total+=length;
  }
  return {...best,total,remaining:Math.max(0,total-best.travelled)};
}
export function guidance(route, position) {
  const current=progress(route,position);
  const steps=route.legs.flatMap(l=>l.steps);
  const next=steps.find(s=>{
    const [lng,lat]=s.maneuver.location;
    return progress(route,{lat,lng}).travelled>current.travelled+15;
  }) || steps.at(-1);
  return {...current,next,turnDistance:next ? Math.max(0,progress(route,{lat:next.maneuver.location[1],lng:next.maneuver.location[0]}).travelled-current.travelled) : 0};
}
export async function fetchRoute(position, lot, fetcher=fetch) {
  const endpoint=(import.meta.env?.VITE_ROUTING_URL || 'https://router.project-osrm.org').replace(/\/$/,'');
  const response=await fetcher(`${endpoint}/route/v1/driving/${position.lng},${position.lat};${lot.lng},${lot.lat}?overview=full&geometries=geojson&steps=true`,{signal:AbortSignal.timeout(15000),referrerPolicy:'no-referrer'});
  if(!response.ok) throw new Error('도로 경로를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
  const data=await response.json(), route=data.routes?.[0];
  if(data.code!=='Ok' || route?.geometry?.type!=='LineString' || route.geometry.coordinates.length<2 || !route.geometry.coordinates.every(c=>c.length>=2 && c.every(Number.isFinite)) || !route.legs?.length || !route.legs.every(l=>l.steps?.length && l.steps.every(s=>s.maneuver?.location?.length===2 && s.maneuver.location.every(Number.isFinite))) || !Number.isFinite(route.duration)) throw new Error('이 위치에서 안내 가능한 도로 경로가 없습니다.');
  return route;
}
