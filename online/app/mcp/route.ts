import { load, view, apply } from "@/lib/store";
export const dynamic="force-dynamic";
const tools=[
 {name:"save_confirmed_deliverable",description:"Save the actual bytes of an explicitly confirmed substantive project deliverable, such as a charter, governance rules or approved report. Provide file path relative to the project deliverables folder, version, confirmation evidence and base64 file bytes. This archives the file, lists its download link and attempts configured Git synchronization. Read the current project revision first. Do not replace substantive files with project status summaries.",inputSchema:{type:"object",properties:{
 revision:{type:"integer"},path:{type:"string"},title:{type:"string"},version:{type:"string"},
 confirmation:{type:"string"},source:{type:"string"},base64:{type:"string"}},required:["revision","path","title","version","confirmation","base64"]}},
 {name:"report_deliverable_local_save",description:"Report a verified local save of an actual deliverable. Only report saved after writing the bytes and checking SHA-256. A remote server cannot itself write a user's computer folder.",inputSchema:{type:"object",properties:{revision:{type:"integer"},artifactId:{type:"string"},sha256:{type:"string"},status:{type:"string",enum:["saved","conflict","failed"]},path:{type:"string"}},required:["revision","artifactId","sha256","status","path"]}},
 {name:"open_project_board",description:"Open the live interactive project board. Return this URL to the user instead of recreating the board as a Markdown table.",inputSchema:{type:"object",properties:{},additionalProperties:false}},
 {name:"read_project",description:"Read current revision, confirmed milestones, applicable requirements, blockers and pending decisions before continuing project work.",inputSchema:{type:"object",properties:{},additionalProperties:false}},
 {name:"update_project",description:"Save progress after checking completion evidence. Propose plan changes first and confirm only after explicit user approval. Read current revision before updates.",inputSchema:{type:"object",properties:{action:{type:"object",description:"Action with type progress, propose, confirm, storage or initialize. Updates require revision. progress accepts updates[{id,status,evidence}], current, next, blockers, pending. propose accepts plan{milestones,requirements}; confirm accepts proposalId. initialize accepts a valid saved state."}},required:["action"]}}
];
export async function POST(request:Request) {
  const rpc=await request.json() as any;
  let result:any;
  try {
    if(rpc.method==="server/discover") result={supportedVersions:["2026-07-28"],capabilities:{tools:{}}};
    else if(rpc.method==="initialize") result={protocolVersion:"2026-07-28",capabilities:{tools:{}},serverInfo:{name:"project-continuity",version:"0.2.0"}};
    else if(rpc.method==="tools/list") result={tools};
    else if(rpc.method==="tools/call") {
      const name=rpc.params?.name;
      let data;
      if(name==="open_project_board") data={url:new URL("/",request.url).href};
      else if(name==="save_confirmed_deliverable") data=await apply({...rpc.params.arguments,type:"save_artifact"});
      else if(name==="report_deliverable_local_save") data=await apply({...rpc.params.arguments,type:"local_receipt"});
      else if(name==="read_project") data=view(await load());
      else if(name==="update_project") data=await apply(rpc.params.arguments.action);
      else throw Error("工具不存在");
      result={content:[{type:"text",text:JSON.stringify(data)}]};
    } else return Response.json({jsonrpc:"2.0",id:rpc.id??null,error:{code:-32601,message:"Method not found"}});
  } catch(error:any) {
    result={content:[{type:"text",text:error.status?error.message:"操作失败，请核对输入后重试"}],isError:true};
  }
  return Response.json({jsonrpc:"2.0",id:rpc.id??null,result},{headers:{"Cache-Control":"no-store"}});
}
