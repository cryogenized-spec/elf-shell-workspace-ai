// Local user-issued, exact-action, short-lived one-use approvals (developer mode).
// The MCP tool itself has no method for issuing approvals.
import {createHash, randomUUID} from "node:crypto";
import {constants} from "node:fs";
import {mkdir, open, rename, unlink, writeFile, lstat} from "node:fs/promises";
import {homedir} from "node:os";
import {join} from "node:path";

export const approvalDirectory = () =>
  join(homedir(), ".config", "elfshell-workspace-ai", "mcp-approvals");

export function createTaskAction(args) {
  const accountId = args.accountId || "default";
  const tasklistId = args.tasklistId;
  const title = typeof args.title==="string" ? args.title.trim() : args.title;
  const notes = args.notes || "";
  const scheduledDate = args.scheduledDate || "";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(accountId) ||
      typeof tasklistId !== "string" || tasklistId.length < 1 || tasklistId.length > 512 ||
      /[\x00-\x1f]/.test(tasklistId) ||
      typeof title !== "string" || !title.trim() || title.length > 1024 ||
      typeof notes !== "string" || notes.length > 8192 ||
      (scheduledDate && !/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) ||
      (scheduledDate && new Date(scheduledDate + "T00:00:00Z").toISOString().slice(0,10) !== scheduledDate))
    throw new Error("INVALID_TASK_CREATE_ARGUMENTS");
  return {tool:"tasks_create_task",accountId,tasklistId,title,notes,scheduledDate};
}

export function actionFingerprint(action) {
  return createHash("sha256").update(JSON.stringify(action)).digest("hex");
}

function approvalPath(directory,action) {
  return join(directory,actionFingerprint(action)+".json");
}

async function secureDirectory(directory) {
  await mkdir(directory,{recursive:true,mode:0o700});
  const stat=await lstat(directory);
  if(!stat.isDirectory() || (stat.mode & 0o077) !== 0)
    throw new Error("APPROVAL_DIRECTORY_NOT_PRIVATE");
}

export async function issueLocalApproval(action,{directory=approvalDirectory(),now=Date.now()}={}) {
  await secureDirectory(directory);
  const record={version:1,action,issuedAt:now,expiresAt:now+120000};
  const path=approvalPath(directory,action);
  try {
    await writeFile(path,JSON.stringify(record),{encoding:"utf8",mode:0o600,flag:"wx"});
  } catch(error) {
    if(error?.code!=="EEXIST")throw error;
    // Reject live approvals, but let a local operator reapprove an expired
    // action without requiring a fake MCP write to consume the old grant.
    const existing=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
    let prior;
    try {
      const stat=await existing.stat();
      if(!stat.isFile() || (stat.mode & 0o077)!==0)
        throw Error("WRITE_APPROVAL_INVALID");
      prior=JSON.parse(await existing.readFile({encoding:"utf8"}));
    } finally {await existing.close();}
    if(prior.version!==1 || JSON.stringify(prior.action)!==JSON.stringify(action) ||
       !Number.isFinite(prior.expiresAt))
      throw Error("WRITE_APPROVAL_INVALID");
    if(prior.expiresAt>now)throw Error("WRITE_APPROVAL_ALREADY_ACTIVE");
    // Move aside the old inactive grant; never overwrite a live grant in place.
    const old=path+".expired-"+randomUUID();
    await rename(path,old);
    try {await writeFile(path,JSON.stringify(record),{encoding:"utf8",mode:0o600,flag:"wx"});}
    finally {await unlink(old).catch(()=>{});}
  }
  return {fingerprint:actionFingerprint(action),expiresAt:record.expiresAt};
}

export function createFileApprovalGate({directory=approvalDirectory(),now=()=>Date.now()}={}) {
  return {
    async consume(action) {
      // Atomic rename makes the grant single-use even with concurrent MCP calls.
      const path=approvalPath(directory,action);
      const claimed=path+".used-"+randomUUID();
      try{await rename(path,claimed);}
      catch {throw new Error("WRITE_APPROVAL_REQUIRED");}
      try {
        const file=await open(claimed,constants.O_RDONLY|constants.O_NOFOLLOW);
        let record, stat;
        try{
          stat=await file.stat();
          if(!stat.isFile() || (stat.mode & 0o077) !== 0)
            throw new Error("WRITE_APPROVAL_INVALID");
          record=JSON.parse(await file.readFile({encoding:"utf8"}));
        }finally{await file.close();}
        const time=now();
        if (record.version!==1 || record.issuedAt>time ||
            record.expiresAt<=time || record.expiresAt-record.issuedAt>120000 ||
            JSON.stringify(record.action)!==JSON.stringify(action))
          throw new Error("WRITE_APPROVAL_EXPIRED_OR_MISMATCHED");
        return true;
      } finally {await unlink(claimed).catch(()=>{});}
    }
  };
}
