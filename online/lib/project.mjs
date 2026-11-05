import { localReceipt, relativePath } from "./deliverables.mjs";
export class ProjectError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const ensure = (value, message) => { if (!value) throw new ProjectError(message); };
const text = value => typeof value === "string" && value.trim().length > 0 && value.length <= 20000;
export function validate(state) {
  ensure(state && text(state.title) && text(state.id), "项目名称或 ID 无效");
  ensure(Array.isArray(state.milestones) && state.milestones.length <= 1000, "里程碑列表无效");
  const nodes = new Map();
  for (const m of state.milestones) {
    ensure(text(m.id) && !nodes.has(m.id) && text(m.title) && text(m.criterion), "里程碑 ID、名称或完成标准无效");
    ensure(["todo","active","blocked","done"].includes(m.status), "里程碑状态无效");
    if (m.status === "done") ensure(text(m.evidence), "完成里程碑须记录依据");
    nodes.set(m.id,m);
  }
  for (const m of nodes.values()) {
    const seen = new Set();
    for (let node = m; node; node = nodes.get(node.parent)) {
      ensure(!seen.has(node.id), "里程碑存在循环");
      seen.add(node.id);
      ensure(!node.parent || nodes.has(node.parent), "父里程碑不存在");
    }
    if (m.status === "done") ensure(![...nodes.values()].some(c=>c.parent===m.id && c.status!=="done"), "子里程碑尚未完成");
  }
  ensure(state.progress && Array.isArray(state.progress.current), "进展结构无效");
  ensure(state.progress.current.every(id=>["active","blocked"].includes(nodes.get(id)?.status)), "当前里程碑须为进行中或受阻");
  for (const key of ["next","pending","blockers"]) {
    ensure(Array.isArray(state.progress[key]) && state.progress[key].every(text), "进展列表无效");
  }
  ensure(Array.isArray(state.requirements), "工作要求无效");
  const ids = new Set();
  for (const r of state.requirements) {
    ensure(text(r.id) && !ids.has(r.id) && text(r.text), "工作要求 ID 或内容无效");
    ids.add(r.id);
    ensure(!r.scope || nodes.has(r.scope), "工作要求范围不存在");
  }
}
export function requirements(state) {
  const scopes = new Set();
  const nodes = new Map(state.milestones.map(m=>[m.id,m]));
  for (const id of state.progress.current) {
    for (let m=nodes.get(id);m;m=nodes.get(m.parent)) scopes.add(m.id);
  }
  return state.requirements.filter(r=>!r.scope || scopes.has(r.scope))
    .sort((a,b)=>Number(!a.scope)-Number(!b.scope));
}
export function handoff(state) {
  const clean = s => String(s).replace(/[\r\n]/g," ");
  const sections = [
    ["当前里程碑",state.progress.current.map(id=>state.milestones.find(m=>m.id===id)?.title)],
    ["下一步",state.progress.next],["阻塞事项",state.progress.blockers],["待确认事项",state.progress.pending],
    ["当前适用要求",requirements(state).map(r=>r.text)],
    ["已完成及依据",state.milestones.filter(m=>m.status==="done").map(m=>m.title+" · "+m.evidence)]
  ];
  return "# "+clean(state.title)+"\n\n修订 "+state.revision+" · "+state.updated+
    "\n\n完整计划及历史见 project-state.json\n"+
    sections.map(([title,items])=>"\n## "+title+"\n\n"+(items.length?items:["暂无"]).map(x=>"- "+clean(x)).join("\n")+"\n").join("");
}
export function transition(previous, action, now = new Date().toISOString()) {
  const state = structuredClone(previous);
  if (action.type === "progress") {
    for (const update of action.updates || []) {
      const node=state.milestones.find(m=>m.id===update.id);
      ensure(node, "里程碑不存在");
      node.status=update.status;
      delete node.evidence;
      if(update.status==="done") node.evidence=update.evidence;
    }
    for(const key of ["current","next","pending","blockers"]) {
      if(action[key]!==undefined) state.progress[key]=action[key];
    }
  } else if (action.type === "propose") {
    const candidate=structuredClone(state);
    candidate.milestones=action.plan.milestones;
    candidate.requirements=action.plan.requirements;
    candidate.progress.current=candidate.progress.current.filter(id=>candidate.milestones.some(m=>m.id===id));
    validate(candidate);
    state.proposal={id:crypto.randomUUID(),plan:action.plan,baseRevision:state.revision+1,created:now};
  } else if (action.type === "confirm") {
    ensure(state.proposal && state.proposal.id===action.proposalId, "提案已变更，请重新核对");
    ensure(state.proposal.baseRevision===state.revision, "提案后进展已变化，请重新提出并核对提案");
    state.milestones=state.proposal.plan.milestones;
    state.requirements=state.proposal.plan.requirements;
    state.progress.current=state.progress.current.filter(id=>state.milestones.some(m=>m.id===id));
    delete state.proposal;
  } else if(action.type === "artifact") {
    relativePath(action.artifact.path);
    state.artifacts=[...(state.artifacts || []), action.artifact];
  } else if(action.type === "local_receipt") {
    localReceipt(state,action);
  } else if(action.type === "storage") {
    ensure(["cloud","git"].includes(action.mode),"无效的保存模式");
    if(action.mode==="git") ensure(/^[\w.-]+\/[\w.-]+$/.test(action.repository),"仓库格式应为 owner/repo");
    state.storage={mode:action.mode,repository:action.repository || "",branch:action.branch || "main",
      folder:String(action.folder || ""),gitDirectory:action.gitDirectory ? relativePath(action.gitDirectory) : "成果文件",
      status:action.mode==="git"?"pending":"cloud"};
  } else throw new ProjectError("不支持的更新类型");
  validate(state);
  state.revision++;
  state.updated=now;
  state.history=state.history || [];
  state.history.push({revision:state.revision,time:now,type:action.type,change:action});
  return state;
}
