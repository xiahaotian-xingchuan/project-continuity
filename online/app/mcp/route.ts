import { load, view, apply } from "@/lib/store";
export const dynamic="force-dynamic";
const tools=[
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
