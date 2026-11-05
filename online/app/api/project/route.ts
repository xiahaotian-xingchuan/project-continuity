import { apply, load, view } from "@/lib/store";
import { handoff } from "@/lib/project.mjs";
export const dynamic="force-dynamic";
const json=(data:any,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
export async function GET(request:Request) {
  try {
    const state=await load();
    const download=new URL(request.url).searchParams.get("download");
    if(download && state) {
      const markdown=download==="markdown";
      return new Response(markdown?handoff(state):JSON.stringify(state,null,2),{headers:{
        "Content-Type":markdown?"text/markdown; charset=utf-8":"application/json",
        "Content-Disposition":'attachment; filename="'+(markdown?"PROJECT_STATUS.md":"project-state.json")+'"',
        "Cache-Control":"private, no-store"
      }});
    }
    return json(view(state));
  } catch { return json({error:"项目读取失败，请重试"},500); }
}
export async function POST(request:Request) {
  if(request.headers.get("origin")!==new URL(request.url).origin) return json({error:"请求来源无效"},403);
  try {
    const raw=await request.text();
    if(raw.length>1000000) return json({error:"请求过大"},413);
    return json(await apply(JSON.parse(raw)));
  } catch(error:any) { return json({error:error.status?error.message:"更新失败，请核对输入"},error.status||400); }
}
