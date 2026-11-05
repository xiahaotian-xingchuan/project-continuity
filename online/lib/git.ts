import { handoff, ProjectError } from "./project.mjs";
export async function pushProject(state:any, token:string) {
  const config=state.storage;
  if(config?.mode!=="git") throw new ProjectError("请先设置 Git 仓库");
  if(!token) throw new ProjectError("在线 Git 授权尚未配置。请在站点密钥中设置 GITHUB_TOKEN，下载功能可正常使用。");
  const base="https://api.github.com/repos/"+config.repository;
  const invoke=async(path:string,method="GET",body?:any)=>{
    const result=await fetch(base+path,{method,headers:{Authorization:"Bearer "+token,
      Accept:"application/vnd.github+json","User-Agent":"Project-Continuity",
      "Content-Type":"application/json"},body:body?JSON.stringify(body):undefined});
    if(!result.ok) throw new ProjectError("GitHub 操作失败（"+result.status+"）。请检查仓库、分支和授权。",502);
    return result.json() as Promise<any>;
  };
  const ref=await invoke("/git/ref/heads/"+encodeURIComponent(config.branch));
  const baseCommit=await invoke("/git/commits/"+ref.object.sha);
  const prefix=".project-continuity/"+state.id+"/";
  const tree=await invoke("/git/trees","POST",{base_tree:baseCommit.tree.sha,tree:[
    {path:prefix+"project-state.json",mode:"100644",type:"blob",content:JSON.stringify(state,null,2)},
    {path:prefix+"PROJECT_STATUS.md",mode:"100644",type:"blob",content:handoff(state)}
  ]});
  const commit=await invoke("/git/commits","POST",{message:"Project Continuity revision "+state.revision,
    tree:tree.sha,parents:[ref.object.sha]});
  await invoke("/git/refs/heads/"+encodeURIComponent(config.branch),"PATCH",{sha:commit.sha,force:false});
  return {commit:commit.sha,revision:state.revision,time:new Date().toISOString()};
}
