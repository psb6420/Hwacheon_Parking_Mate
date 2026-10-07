import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from '../src/catalog.js';
import { autoReserve, lotsView } from '../src/domain.js';
import { boundary, entryStatus } from '../src/location.js';
import { fetchRoute, guidance, instruction } from '../src/navigation.js';
const now=Date.now(), inside={lat:38.1034,lng:127.7041,accuracy:10,timestamp:now};
const state=()=>({lots:CATALOG.map(l=>({...l,updatedAt:now})),reservations:[]});
test('entry gate accepts Hwacheon and blocks missing, outside, stale, uncertain and boundary fixes',()=>{
 assert.equal(entryStatus(inside,now).allowed,true);
 assert.equal(entryStatus(undefined,now).code,'missing');
 assert.equal(entryStatus({...inside,lat:37.881,lng:127.73},now).code,'outside');
 assert.equal(entryStatus({...inside,timestamp:now-30001},now).code,'stale');
 assert.equal(entryStatus({...inside,timestamp:now+10001},now).code,'stale');
 assert.equal(entryStatus({...inside,accuracy:101},now).code,'accuracy');
 assert.equal(entryStatus({...inside,accuracy:-1},now).code,'missing');
 const [lng,lat]=boundary.geometry.coordinates[0][0];
 assert.equal(entryStatus({...inside,lng,lat},now).allowed,false);
});
test('auto assignment ignores requested lot and uses available capacity with location',()=>{
 const s=state(), r=autoReserve(s,{position:inside,lotId:'P4',people:3,clientId:'test-device',token:'pass'},now);
 assert.equal(r.lotId,'P2'); assert.equal(r.assignment,'automatic');
 assert.equal(lotsView(s,now).find(l=>l.id==='P2').reserved,1);
 assert.equal(JSON.stringify(r).includes('127.7041'),false);
 assert.throws(()=>autoReserve(s,{position:inside,people:3,clientId:'test-device',token:'second'},now),/진행 중/);
 const near=state(); for(const l of near.lots)l.occupied=0;
 assert.equal(autoReserve(near,{position:{...inside,lat:38.1072,lng:127.7096},people:1,clientId:'near',token:'near'},now).lotId,'P1');
});
test('closed, full, stale and accessibility-ineligible lots are excluded; invalid entry never reserves',()=>{
 const s=state(); s.lots[1].status='closed'; s.lots[0].updatedAt=now-16*60000;
 assert.throws(()=>autoReserve(s,{position:inside,accessible:true,people:1,clientId:'a',token:'a'},now),/배정 가능/);
 assert.equal(autoReserve(s,{position:inside,people:1,clientId:'a',token:'a'},now).lotId,'P3');
 assert.throws(()=>autoReserve(state(),{position:{...inside,lat:37.8},people:1,clientId:'b',token:'b'},now),/진입 대기/);
});
const route={duration:120,geometry:{type:'LineString',coordinates:[[127.7,38.1],[127.71,38.1],[127.71,38.11]]},legs:[{steps:[{name:'출발로',maneuver:{type:'depart',location:[127.7,38.1]}},{name:'목적지로',maneuver:{type:'turn',modifier:'left',location:[127.71,38.1]}},{maneuver:{type:'arrive',location:[127.71,38.11]}}]}]};
test('route progression measures road distance, upcoming turn, off-route and arrival',()=>{
 const first=guidance(route,{lat:38.1,lng:127.705}); assert.equal(first.next.name,'목적지로'); assert.ok(first.turnDistance>400 && first.turnDistance<450); assert.ok(first.remaining>1500);
 const after=guidance(route,{lat:38.105,lng:127.71}); assert.equal(after.next.maneuver.type,'arrive'); assert.ok(after.remaining<600);
 assert.ok(guidance(route,{lat:38.12,lng:127.72}).distance>1000);
 assert.ok(guidance(route,{lat:38.11,lng:127.71}).remaining<1);
 assert.match(instruction(first.next),/좌회전/);
});
test('routing failures never substitute a fabricated straight line',async()=>{
 const response=data=>async()=>({ok:true,json:async()=>data});
 assert.equal(await fetchRoute(inside,CATALOG[1],response({code:'Ok',routes:[route]})),route);
 await assert.rejects(fetchRoute(inside,CATALOG[1],response({code:'NoRoute',routes:[]})),/도로 경로/);
 await assert.rejects(fetchRoute(inside,CATALOG[1],response({code:'Ok',routes:[{duration:100,geometry:{type:'LineString',coordinates:[[127,38]]}}]})),/도로 경로/);
 await assert.rejects(fetchRoute(inside,CATALOG[1],async()=>({ok:false})),/불러오지/);
});
