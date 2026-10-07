import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from '../src/catalog.js';
import { lotsView, reserve, transition, updateLot, rankLots, HOLD_MS, STALE_MS } from '../src/domain.js';
const now = 1800000000000;
const state = () => ({ lots: CATALOG.map(l=>({...l,updatedAt:now})), reservations:[], events:[] });
const create = (s, patch={}) => reserve(s,{lotId:'P2',clientId:'client-a',people:3,token:'token-a',...patch},now);
test('one vehicle is held, checkin preserves usage, checkout releases it',()=>{
 const s=state(); const before=lotsView(s,now)[1].available;
 create(s); assert.equal(lotsView(s,now)[1].available,before-1);
 transition(s,'token-a','checkin',now); assert.equal(lotsView(s,now)[1].available,before-1);
 assert.throws(()=>transition(s,'token-a','checkin',now));
 transition(s,'token-a','checkout',now); assert.equal(lotsView(s,now)[1].available,before);
});
test('last slot cannot be oversold and duplicate client is rejected',()=>{
 const s=state(); s.lots[1].occupied=119; create(s);
 assert.throws(()=>create(s,{token:'token-b',clientId:'client-b'}));
 assert.throws(()=>create(s,{token:'token-c',lotId:'P1'}));
});
test('expiry and cancellation release exactly one slot',()=>{
 const s=state(); create(s); assert.equal(lotsView(s,now+HOLD_MS)[1].available,82);
 assert.equal(s.reservations[0].status,'expired'); assert.throws(()=>transition(s,'token-a','checkin',now+HOLD_MS));
 s.lots[1].updatedAt=now; create(s,{token:'token-b'}); transition(s,'token-b','cancel',now);
 assert.equal(lotsView(s,now)[1].available,82); assert.throws(()=>transition(s,'token-b','cancel',now));
});
test('closed, full, stale and invalid passenger reservations are blocked',()=>{
 const s=state(); assert.throws(()=>create(s,{lotId:'P4'}));
 s.lots[1].status='closed'; assert.throws(()=>create(s)); s.lots[1].status='open';
 s.lots[1].updatedAt=now-STALE_MS-1; assert.throws(()=>create(s));
 s.lots[1].updatedAt=now; for(const people of [0,10,2.5,'3',NaN]) assert.throws(()=>create(s,{people}));
});
test('manual edits respect holds and checked-in cars',()=>{
 const s=state(); create(s); assert.throws(()=>updateLot(s,'P2',{occupied:120,status:'open'},now));
 updateLot(s,'P2',{occupied:119,status:'open'},now); assert.equal(lotsView(s,now)[1].available,0);
});
test('recommendations prioritize capacity, walking and accessibility as selected',()=>{
 const lots=lotsView(state(),now); assert.equal(rankLots(lots,'walk')[0].id,'P1');
 assert.notEqual(rankLots(lots)[0].id,'P1'); assert.equal(rankLots(lots,'shuttle')[0].id,'P3');
 assert.ok(rankLots(lots,'balanced',true).every(l=>l.accessible)); assert.equal(rankLots(lots).at(-1).id,'P4');
});
