#!/usr/bin/env node
// Explicit local operator command. Not exposed to the agent via any MCP tool.
import {createInterface} from "node:readline/promises";
import {stdin,stderr} from "node:process";
import {createTaskAction,issueLocalApproval} from "./approvals.js";

const map={ "--account":"accountId","--tasklist":"tasklistId",
  "--title":"title","--notes":"notes","--date":"scheduledDate"};
const fields={};
try{
  for(let i=2;i<process.argv.length;i+=2){
    const name=map[process.argv[i]];
    if(!name||i+1>=process.argv.length||name in fields)
      throw Error("INVALID_OPTIONS");
    fields[name]=process.argv[i+1];
  }
  if(!stdin.isTTY)throw Error("INTERACTIVE_OPERATOR_TERMINAL_REQUIRED");
  const action=createTaskAction(fields);
  stderr.write("Task creation approval (single use, expires in 2 minutes):\n");
  stderr.write(JSON.stringify(action,null,2)+"\n");
  const rl=createInterface({input:stdin,output:stderr});
  const answer=await rl.question('Type APPROVE to authorize exactly this action: ');
  rl.close();
  if(answer!=="APPROVE")throw Error("NOT_APPROVED");
  const record=await issueLocalApproval(action);
  stderr.write("Authorized action fingerprint: "+record.fingerprint+"\n");
}catch(error){
  stderr.write("No approval issued: "+(error?.message||"unknown error")+"\n");
  process.exitCode=1;
}
