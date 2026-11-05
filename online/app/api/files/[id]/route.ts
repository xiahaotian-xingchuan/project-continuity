import { load, bucket } from "@/lib/store";
export const dynamic="force-dynamic";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  const state=await load();
  const file=state?.artifacts?.find((a:any)=>a.id===id);
  if(!file) return new Response("File not found",{status:404});
  const object=await bucket().get(file.key);
  if(!object) return new Response("File unavailable",{status:404});
  const name=file.path.split("/").at(-1);
  return new Response(object.body,{headers:{"Content-Type":"application/octet-stream",
    "Content-Disposition":"attachment; filename*=UTF-8''"+encodeURIComponent(name),
    "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",
    "X-File-SHA256":file.sha256}});
}
