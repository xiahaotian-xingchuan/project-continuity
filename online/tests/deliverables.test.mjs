import { test } from "node:test";
import assert from "node:assert/strict";
import { relativePath, decodeFile, latestArtifacts, localReceipt } from "../lib/deliverables.mjs";
test("artifact paths stay inside deliverables directories",()=>{
 for(const path of ["/root/file","../file","a/../file","C:/file","a\\b",".git/config"]) assert.throws(()=>relativePath(path));
 assert.equal(relativePath("治理规则/总纲_v1.0.docx"),"治理规则/总纲_v1.0.docx");
});
test("confirmed file bytes retain their hash and original content",async()=>{
 const input={path:"总纲.docx",title:"建设总纲",version:"v1.0",confirmation:"负责人确认",base64:btoa("document-bytes")};
 const result=await decodeFile(input);
 assert.equal(new TextDecoder().decode(result.bytes),"document-bytes");
 assert.equal(result.sha256.length,64);
 await assert.rejects(()=>decodeFile({...input,confirmation:""}));
});
test("sync chooses latest substantive file and local receipts verify content",()=>{
 const state={artifacts:[{id:"a",path:"总纲.docx",sha256:"old"},{id:"b",path:"总纲.docx",sha256:"new"}]};
 assert.equal(latestArtifacts(state)[0].id,"b");
 assert.throws(()=>localReceipt(state,{artifactId:"b",sha256:"wrong",status:"saved"}));
 localReceipt(state,{artifactId:"b",sha256:"new",status:"saved",path:"/data/总纲.docx"});
 assert.equal(state.artifacts[1].local.status,"saved");
});
