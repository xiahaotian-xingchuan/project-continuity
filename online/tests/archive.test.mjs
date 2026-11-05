import {test} from 'node:test';
import assert from 'node:assert/strict';
import {archiveRoute,provenanceRecord} from '../lib/archive.mjs';
const state={id:'sample',revision:4,milestones:[{id:'p1',title:'知识试点'},{id:'task',title:'分析',parent:'p1'}],progress:{current:['task']}};
const input={kind:'evidence',knowledge:'K01 利益识别',hypothesis:'H01 假设',evidence:'E01 案例',path:'原文.pdf',version:'v1',title:'案例',provenance:{source:'https://example.org/paper',locator:'p2',task:'run-1',retrievedAt:'2026-11-05T08:00:00Z',relation:'counter'}};
test('plan hierarchy and evidence provenance remain unreviewed',()=>{
 const route=archiveRoute(state,input);
 assert.equal(route.path,'执行区域/p1 知识试点/task 分析/核心知识点 K01 利益识别/假设 H01 假设/假设依据 E01 案例/v1/原文.pdf');
 const p=provenanceRecord(state,input,route,'hash');assert.equal(p.reviewStatus,'pending');assert.equal(p.hypothesisStatus,'unverified');assert.equal(p.relation,'counter');
 assert.throws(()=>provenanceRecord(state,{...input,provenance:{}},route,'hash'));
});
test('renamed plans retain previous folder and versions are independent',()=>{
 const route=archiveRoute(state,input);
 const changed=structuredClone(state);changed.artifacts=[route];changed.milestones[0].title='已改名';
 const next=archiveRoute(changed,{...input,version:'v2'});
 assert.equal(next.archive.folder,route.archive.folder);assert.notEqual(next.path,route.path);
});
test('invalid routing and ambiguous current tasks are rejected',()=>{
 for(const value of ['../escape','CON','bad/name','bad.']) assert.throws(()=>archiveRoute(state,{...input,knowledge:value}));
 assert.throws(()=>archiveRoute({...state,progress:{current:['p1','task']}},input));
 assert.throws(()=>archiveRoute(state,{...input,milestoneId:'unknown'}));
});
