import { env } from "cloudflare:workers";
import { ProjectError, validate, transition, requirements } from "./project.mjs";
import { pushProject } from "./git";
function db() { return (env as unknown as {DB:D1Database}).DB; }
export async function load() {
  const row=await db().prepare("SELECT payload FROM projects WHERE id = ?").bind("main").first<{payload:string}>();
  return row ? JSON.parse(row.payload) : null;
}
export function view(state:any) {
  if(!state) return {empty:true};
  return {project:state, requirements:requirements(state),pendingProposal:state.proposal,
    sync:{status:state.storage?.status || "cloud",revision:state.revision},
    storage:{cloud:true,git:state.storage?.mode==="git"?{remote:"https://github.com/"+state.storage.repository,branch:state.storage.branch}:null}};
}
export async function apply(action:any) {
  const previous=await load();
  if(action.type==="initialize") {
    if(previous) throw new ProjectError("项目已经存在",409);
    validate(action.state);
    const state={...action.state, storage:{mode:"cloud",status:"cloud"}};
    const result=await db().prepare("INSERT OR IGNORE INTO projects (id, revision, payload) VALUES (?, ?, ?)")
      .bind("main",state.revision,JSON.stringify(state)).run();
    if(!result.meta.changes) throw new ProjectError("项目已由另一会话初始化",409);
    return view(state);
  }
  if(!previous) throw new ProjectError("项目尚未初始化",404);
  if(action.type==="sync") {
    const receipt=await pushProject(previous,(env as unknown as {GITHUB_TOKEN:string}).GITHUB_TOKEN);
    const latest=await load();
    if(latest.storage?.mode!=="git" || latest.storage.repository!==previous.storage.repository || latest.storage.branch!==previous.storage.branch) {
      return view(latest);
    }
    latest.storage={...latest.storage,status:latest.revision===receipt.revision?"synced":"pending",syncedRevision:receipt.revision,receipt};
    const result=await db().prepare("UPDATE projects SET payload = ? WHERE id = ? AND revision = ?")
      .bind(JSON.stringify(latest),"main",latest.revision).run();
    if(!result.meta.changes) throw new ProjectError("Git 已推送，在线进度又有变更，请重新读取",409);
    return view(latest);
  }
  if(action.revision!==previous.revision) throw new ProjectError("进展已变化，请刷新后核对",409);
  const state=transition(previous,action);
  if(state.storage?.mode==="git") state.storage.status="pending";
  const result=await db().prepare("UPDATE projects SET revision = ?, payload = ? WHERE id = ? AND revision = ?")
    .bind(state.revision,JSON.stringify(state),"main",previous.revision).run();
  if(!result.meta.changes) throw new ProjectError("另一会话已更新项目，请刷新",409);
  if(state.storage?.mode==="git" && (env as unknown as {GITHUB_TOKEN:string}).GITHUB_TOKEN) {
    try { return await apply({type:"sync",revision:state.revision}); }
    catch { return {...view(state),warning:"进展已在线保存，Git 推送待重试。"}; }
  }
  return view(state);
}
