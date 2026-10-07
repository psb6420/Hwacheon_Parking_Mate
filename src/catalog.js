// ALL locations, capacities, walking times and shuttle details below are fixtures.
// Replace only after confirmation with Hwacheon staff; do not label them live.
export const FESTIVAL = { name: '산천어축제', lat: 38.1068, lng: 127.7068 };
export const CATALOG = [
  { id: 'P1', name: '축제장 인근 A', area: '중심권', lat: 38.1072, lng: 127.7096, capacity: 80, occupied: 72, walk: 5, shuttle: null, accessible: true, hours: '09:00–18:00', note: '가까운 도보 동선이 필요한 방문객을 위한 예시 구역', status: 'open' },
  { id: 'P2', name: '강변 분산 B', area: '강변권', lat: 38.1034, lng: 127.7041, capacity: 120, occupied: 38, walk: 12, shuttle: { interval: 15, ride: 5, stop: 'B 구역 입구', hours: '09:00–18:00' }, accessible: true, hours: '09:00–18:00', note: '주차 여유와 축제장 접근성을 함께 고려한 예시 구역', status: 'open' },
  { id: 'P3', name: '외곽 환승 C', area: '외곽권', lat: 38.0961, lng: 127.7048, capacity: 160, occupied: 25, walk: 23, shuttle: { interval: 10, ride: 8, stop: 'C 구역 안내부스', hours: '09:00–18:00' }, accessible: false, hours: '09:00–18:00', note: '혼잡한 중심권 진입을 줄이는 셔틀 연계 예시 구역', status: 'open' },
  { id: 'P4', name: '도심 임시 D', area: '도심권', lat: 38.1055, lng: 127.7135, capacity: 50, occupied: 50, walk: 9, shuttle: null, accessible: false, hours: '09:00–18:00', note: '만차일 때 다른 구역으로 전환하는 상황을 체험하세요', status: 'open' }
];
