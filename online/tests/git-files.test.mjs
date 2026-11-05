import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pushProject} from '../lib/git.ts';
test('Git commits actual deliverable bytes into selected directory',async()=>{
 const original=global.fetch;
 const requests=[];
 global.fetch=async(url,options={})=>{
   requests.push({url,options,body:options.body?JSON.parse(options.body):null});
   let body={};
   if(url.includes('/git/ref/heads/')) body={object:{sha:'parent'}};
   else if(url.includes('/git/commits/parent')) body={tree:{sha:'base-tree'}};
   else if(url.endsWith('/git/blobs')) body={sha:'file-blob'};
   else if(url.endsWith('/git/trees')) body={sha:'new-tree'};
   else if(url.endsWith('/git/commits')) body={sha:'commit'};
   return Response.json(body);
 };
 try {
   const bytes=new Uint8Array([80,75,0,255,100]);
   const state={id:'project',revision:9,storage:{mode:'git',repository:'owner/repo',branch:'main',gitDirectory:'确认成果'},
     artifacts:[{id:'file',path:'治理/总纲.docx',key:'blob-key',sha256:'hash'}]};
   const receipt=await pushProject(state,'test-token',{get:async()=>({arrayBuffer:async()=>bytes.buffer})});
   const blob=requests.find(r=>r.url.endsWith('/git/blobs')).body;
   assert.deepEqual(Uint8Array.from(atob(blob.content),c=>c.charCodeAt(0)),bytes);
   const tree=requests.find(r=>r.url.endsWith('/git/trees')).body;
   assert.equal(tree.tree.length,1);
   assert.equal(tree.tree[0].path,'确认成果/治理/总纲.docx');
   assert.equal(receipt.artifacts[0].id,'file');
 } finally {global.fetch=original;}
});
