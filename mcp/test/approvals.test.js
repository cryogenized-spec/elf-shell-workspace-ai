import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createFileApprovalGate,issueLocalApproval,createTaskAction} from "../src/approvals.js";

test("local operator can issue one exact short-lived approval; replay or mismatch denied",async()=>{
  const parent=await mkdtemp(join(tmpdir(),"elfshell-approval-test-"));
  const directory=join(parent,"private");
  const action=createTaskAction({accountId:"default",tasklistId:"demo",title:"Synthetic task"});
  try{
    await issueLocalApproval(action,{directory,now:1000});
    const gate=createFileApprovalGate({directory,now:()=>1500});
    const altered=createTaskAction({...action,title:"Another task"});
    await assert.rejects(gate.consume(altered),/WRITE_APPROVAL_REQUIRED/);
    assert.equal(await gate.consume(action),true);
    await assert.rejects(gate.consume(action),/WRITE_APPROVAL_REQUIRED/);
    await issueLocalApproval(action,{directory,now:2000});
    const expired=createFileApprovalGate({directory,now:()=>125001});
    await assert.rejects(expired.consume(action),/WRITE_APPROVAL_EXPIRED_OR_MISMATCHED/);
  }finally{await rm(parent,{recursive:true,force:true});}
});
test("approval fingerprint includes notes, account and scheduled date",()=>{
  const base={accountId:"default",tasklistId:"demo",title:"Tea"};
  assert.notDeepEqual(createTaskAction({...base,notes:"A"}),createTaskAction({...base,notes:"B"}));
  assert.notDeepEqual(createTaskAction({...base,scheduledDate:"2026-11-09"}),
    createTaskAction({...base,scheduledDate:"2026-11-10"}));
  assert.throws(()=>createTaskAction({...base,scheduledDate:"2026-02-31"}));
});

test("expired approval can be reissued, while still-active approval cannot be overwritten",async()=>{
  const parent=await mkdtemp(join(tmpdir(),"elfshell-approval-renew-"));
  const directory=join(parent,"private");
  const action=createTaskAction({accountId:"default",tasklistId:"demo",title:"Review"});
  try{
    await issueLocalApproval(action,{directory,now:1000});
    await assert.rejects(issueLocalApproval(action,{directory,now:60000}),
      /WRITE_APPROVAL_ALREADY_ACTIVE/);
    // Old approval expires at 121000, so the operator can issue a replacement.
    await issueLocalApproval(action,{directory,now:125000});
    const gate=createFileApprovalGate({directory,now:()=>126000});
    assert.equal(await gate.consume(action),true);
    await assert.rejects(gate.consume(action),/WRITE_APPROVAL_REQUIRED/);
  }finally{await rm(parent,{recursive:true,force:true});}
});
test("operator and tool normalize leading/trailing spaces to one exact approved title",()=>{
  assert.deepEqual(createTaskAction({tasklistId:"demo",title:"  Test task  "}),
    createTaskAction({tasklistId:"demo",title:"Test task"}));
});
