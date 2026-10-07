# 위치와 경로 출처

## 화천군 경계
- 파일: `src/data/hwacheon-boundary.json`, SIG_CD 51790 화천군 1개 Feature.
- 출처: [KnellBalm/kr-admin-geojson](https://github.com/KnellBalm/kr-admin-geojson), [sig.geojson](https://raw.githubusercontent.com/KnellBalm/kr-admin-geojson/main/sig.geojson), 2026-10-07 확인.
- 원자료: 작성자가 밝힌 국가공간정보포털(VWorld) 2023-07-29 행정구역 자료.
- 작성자 변환: EPSG:5179 → WGS84, Douglas–Peucker 0.0005도 단순화, 소수점 6자리.
- 사용 조건: 작성자가 요구한 출처 표기를 이 문서에 포함. 원 데이터 및 작성자 권리는 각 권리자에게 있음.
- 현재 공개 경계는 최신 공식 행정경계의 확인본이 아닌 과거 자료 기반 2차 자료. 경계에서 GPS 오차+60m 안쪽은 발급 대기. 실서비스 전 지자체 최신 경계로 검증/교체 필요.

## 도로 경로
- [OSRM API 문서](https://project-osrm.org/docs/v5.24.0/api/): Route driving, GeoJSON geometry와 maneuver steps 사용.
- [공개 데모 이용 정책](https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server): 합리적인 비상업적 사용, 초당 1회 미만, 가동·지연·자료 갱신 보장 없음.
- 현재 브라우저는 경로를 최초 요청하거나 이탈했을 때만 요청하며 최소 30초 간격. 운영/다수 사용자용 서비스로 전환 시 자체 서버 또는 계약 제공자가 필요.
- 길찾기를 누르면 출발/목적지 좌표가 OSRM으로 전달됨. [제공자 개인정보 안내](https://www.fossgis.de/datenschutzerkl%C3%A4rung/).
- OpenStreetMap 지도·경로 자료: [저작권 및 이용 조건](https://www.openstreetmap.org/copyright). 지도에 출처 표시 유지.
- 카카오맵 외부 길찾기는 자동 배정된 구역의 좌표만 전달하는 링크. 카카오 내비 SDK와 실시간 교통 API 연동을 의미하지 않음.

## 운영 구역
카탈로그의 모든 주차장 좌표·수용 대수·셔틀·보행 시간은 예시. 공식 데이터나 예약 승인으로 해석하지 않음.
