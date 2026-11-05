import {ProjectError} from './project.mjs';
import {relativePath} from './deliverables.mjs';
function segment(value) {
  if(typeof value!=='string' || !value.trim() || value.length>100) throw new ProjectError('归档名称不能为空且不能超过100字');
  const s=value.trim();
  relativePath(s);
  if(s.includes('/') || /[. ]$/.test(s) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s)) throw new ProjectError('归档名称包含不可用的文件夹名称');
  return s;
}
export function archiveRoute(state,input) {
  const kind=input.kind || 'formal';
  if(!['formal','evidence'].includes(kind)) throw new ProjectError('无效的文件类别');
  const milestoneId=input.milestoneId || (state.progress.current.length===1?state.progress.current[0]:null);
  const node=state.milestones.find(m=>m.id===milestoneId);
  if(!node) throw new ProjectError('请选择已确认计划中的执行任务');
  const parts=[];const ids=[];const seen=new Set();
  for(let n=node;n;n=state.milestones.find(m=>m.id===n.parent)) {
    if(seen.has(n.id)) throw new ProjectError('计划层级存在循环');seen.add(n.id);
    ids.unshift(n.id);parts.unshift(segment(n.id+' '+n.title));
  }
  const classification={milestoneId,kind};
  if(kind==='evidence') for(const key of ['knowledge','hypothesis','evidence']) classification[key]=segment(input[key]);
  const key=JSON.stringify(classification);
  const prior=(state.artifacts||[]).find(a=>a.archive?.routeKey===key);
  const folder=prior?.archive.folder || ['执行区域',...parts,...(kind==='evidence'?
    ['核心知识点 '+classification.knowledge,'假设 '+classification.hypothesis,'假设依据 '+classification.evidence]:['已确认成果'])].join('/');
  relativePath(input.path);
  const filename=segment(input.path.split('/').at(-1));
  if(filename.endsWith('.provenance.json')) throw new ProjectError('该后缀保留用于来源记录');
  const path=relativePath(folder+'/'+segment(input.version)+'/'+filename);
  relativePath(path+".provenance.json");
  return {path,archive:{...classification,routeKey:key,folder,milestoneIds:ids,planRevision:state.revision}};
}
export function provenanceRecord(state,input,routed,sha256,now=new Date().toISOString()) {
  const evidence=routed.archive.kind==='evidence';
  const p=input.provenance || {};
  if(evidence) {
    for(const key of ['source','locator','task','retrievedAt']) if(typeof p[key]!=='string'||!p[key].trim()||p[key].length>10000) throw new ProjectError('假设依据须记录来源、具体定位、产生任务和获取时间');
    if(!Number.isFinite(Date.parse(p.retrievedAt))) throw new ProjectError('获取时间无效');
    if(!['support','counter','boundary','unclassified'].includes(p.relation)) throw new ProjectError('请选择依据作用');
  }
  return {schema:1,projectId:state.id,path:routed.path,title:input.title,version:input.version,sha256,
    archive:routed.archive,recordedAt:now,reviewStatus:evidence?'pending':'confirmed',
    hypothesisStatus:evidence?'unverified':null,confirmation:evidence?null:input.confirmation,
    source:evidence?p.source:String(input.source||''),locator:String(p.locator||''),task:String(p.task||''),
    retrievedAt:evidence?p.retrievedAt:null,relation:evidence?p.relation:null};
}
