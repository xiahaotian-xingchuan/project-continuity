import { ProjectError } from "./project.mjs";
export function relativePath(value) {
  if (typeof value !== "string" || value.length > 512 || !value ||
      value.startsWith("/") || /[\\\x00-\x1f:*?"<>|]/.test(value) ||
      value.split("/").some(part => !part || part === "." || part === ".." || part.toLowerCase() === ".git")) {
    throw new ProjectError("成果路径须为相对目录内的文件路径，不能包含上级目录或系统保留字符");
  }
  return value;
}
export async function decodeFile(input) {
  relativePath(input.path);
  for (const key of ["title","version","confirmation"]) {
    if (typeof input[key] !== "string" || !input[key].trim() || input[key].length > 10000)
      throw new ProjectError("成果须有标题、版本和确认依据");
  }
  if (typeof input.base64 !== "string" || !input.base64.length || input.base64.length > 14000000)
    throw new ProjectError("单次成果文件须在 10 MB 以内");
  let bytes;
  try { bytes=Uint8Array.from(atob(input.base64), c=>c.charCodeAt(0)); }
  catch { throw new ProjectError("成果文件编码无效"); }
  if (bytes.length > 10000000) throw new ProjectError("单次成果文件须在 10 MB 以内");
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  const sha256=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
  return {bytes,sha256};
}
export function latestArtifacts(state) {
  const files=new Map();
  for (const file of state.artifacts || []) files.set(file.path,file);
  return [...files.values()];
}
export function localReceipt(state, action) {
  const file=state.artifacts?.find(a=>a.id===action.artifactId);
  if(!file || action.sha256!==file.sha256) throw new ProjectError("本地保存回执与成果内容不一致");
  if(!["saved","conflict","failed"].includes(action.status)) throw new ProjectError("无效的本地保存状态");
  file.local={status:action.status,path:String(action.path||""),time:new Date().toISOString()};
}
