import { ProjectError } from "./project.mjs";
import { latestArtifacts, relativePath } from "./deliverables.mjs";
export async function pushProject(state:any, token:string, bucket:R2Bucket) {
  const config=state.storage;
  if(config?.mode!=="git") throw new ProjectError("请先设置成果 Git 仓库");
  if(!token) throw new ProjectError("成果仓库尚未授权。文件已归档，授权后可重试。");
  const artifacts=latestArtifacts(state);
  if(!artifacts.length) throw new ProjectError("尚无已确认的实质性成果文件可同步");
  const base="https://api.github.com/repos/"+config.repository;
  const invoke=async(path:string,method="GET",body?:any)=>{
    const result=await fetch(base+path,{method,headers:{Authorization:"Bearer "+token,
      Accept:"application/vnd.github+json","User-Agent":"Project-Continuity",
      "Content-Type":"application/json"},body:body?JSON.stringify(body):undefined});
    if(!result.ok) throw new ProjectError("GitHub 操作失败（"+result.status+"）。请检查成果仓库、分支和授权。",502);
    return result.json() as Promise<any>;
  };
  const ref=await invoke("/git/ref/heads/"+encodeURIComponent(config.branch));
  const baseCommit=await invoke("/git/commits/"+ref.object.sha);
  const directory=relativePath(config.gitDirectory || "成果文件");
  const tree=[];
  for(const file of artifacts) {
    const object=await bucket.get(file.key);
    if(!object) throw new ProjectError("成果文件不可读取，请重试",502);
    const bytes=new Uint8Array(await object.arrayBuffer());
    let binary="";
    for(let i=0;i<bytes.length;i+=8192) binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    const blob=await invoke("/git/blobs","POST",{content:btoa(binary),encoding:"base64"});
    tree.push({path:directory+"/"+relativePath(file.path),mode:"100644",type:"blob",sha:blob.sha});
  }
  const object=await invoke("/git/trees","POST",{base_tree:baseCommit.tree.sha,tree});
  const commit=await invoke("/git/commits","POST",{message:"Save confirmed project deliverables",tree:object.sha,parents:[ref.object.sha]});
  await invoke("/git/refs/heads/"+encodeURIComponent(config.branch),"PATCH",{sha:commit.sha,force:false});
  return {commit:commit.sha,revision:state.revision,time:new Date().toISOString(),
    artifacts:artifacts.map((a:any)=>({id:a.id,sha256:a.sha256,path:directory+"/"+a.path}))};
}
