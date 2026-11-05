import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validate,transition,requirements,handoff} from '../lib/project.mjs';
const state={id:'fixture',title:'验证项目',revision:1,milestones:[
{id:'p0',title:'阶段一',criterion:'核对标准',status:'active',parent:null},
{id:'child',title:'子任务',criterion:'形成记录',status:'todo',parent:'p0'}],
requirements:[{id:'a',text:'全局要求'},{id:'b',scope:'p0',text:'阶段要求'}],
progress:{current:['p0'],next:['核对'],blockers:[],pending:[]},history:[]};
test('scope and export preserve current requirements',()=>{
 validate(state);
 assert.equal(requirements(state).length,2);
 assert.match(handoff(state),/阶段要求/);
});
test('completion requires evidence and children',()=>{
 assert.throws(()=>transition(state,{type:'progress',updates:[{id:'child',status:'done'}]}));
 assert.throws(()=>transition(state,{type:'progress',updates:[{id:'p0',status:'done',evidence:'记录'}],current:[]}));
});
test('proposal is separate and stale proposals require rereview',()=>{
 const s=transition(state,{type:'propose',plan:{milestones:state.milestones,requirements:[{id:'a',text:'新要求'}]}});
 assert.equal(s.requirements.length,2);
 const changed=transition(s,{type:'progress',next:['补充核对']});
 assert.throws(()=>transition(changed,{type:'confirm',proposalId:s.proposal.id}));
 const confirmed=transition(s,{type:'confirm',proposalId:s.proposal.id});
 assert.equal(confirmed.requirements[0].text,'新要求');
});
test('cycles and invalid current nodes are rejected',()=>{
 assert.throws(()=>validate({...state,milestones:[{...state.milestones[0],parent:'child'},state.milestones[1]]}));
 assert.throws(()=>transition(state,{type:'progress',current:['child']}));
});
