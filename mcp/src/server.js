import {McpServer} from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import {createEnvironmentSessions} from "./sessions.js";
import {createFileApprovalGate} from "./approvals.js";
import {createTasksService} from "./tasks.js";

const ACCOUNT=z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).default("default");
const ID=z.string().min(1).max(512);
const TOKEN=z.string().max(1024).optional();
const SIZE=z.number().int().min(1).max(100).default(25);
const WRAP=(task)=>async(args)=>{
  try{
    const result=await task(args);
    return {content:[{type:"text",text:JSON.stringify(result)}],structuredContent:result};
  }catch(_error){
    const known=new Set([
      "UNKNOWN_GOOGLE_ACCOUNT","INVALID_ACCOUNT_ID","GOOGLE_SESSION_NOT_CONFIGURED",
      "GOOGLE_SESSION_EXPIRED","GOOGLE_TASKS_SCOPE_MISSING","INVALID_RESOURCE_ID",
      "INVALID_TASK_CREATE_ARGUMENTS","WRITE_APPROVAL_REQUIRED",
      "WRITE_APPROVAL_INVALID","WRITE_APPROVAL_EXPIRED_OR_MISMATCHED",
      "GOOGLE_RESPONSE_TOO_LARGE","GOOGLE_RESPONSE_INVALID","GOOGLE_DESTINATION_REJECTED",
      "GOOGLE_NETWORK_UNAVAILABLE","GOOGLE_UNAUTHORIZED","GOOGLE_FORBIDDEN",
      "GOOGLE_NOT_FOUND","GOOGLE_RATE_LIMITED","GOOGLE_UNAVAILABLE",
      "GOOGLE_REQUEST_REJECTED"
    ]);
    const code=known.has(_error?.message)?_error.message:"GOOGLE_OPERATION_FAILED";
    return {content:[{type:"text",text:JSON.stringify({error:code})}],isError:true};
  }
};

export const TOOL_NAMES=Object.freeze([
  "tasks_list_tasklists","tasks_list_tasks","tasks_get_task","tasks_create_task"
]);

export function createServer({sessions=createEnvironmentSessions(),
                              fetchImpl=fetch,approvalGate=createFileApprovalGate()}={}) {
  const service=createTasksService({sessions,fetchImpl,approvalGate});
  const server=new McpServer({name:"elfshell-google-workspace",version:"0.1.0"});
  server.registerTool("tasks_list_tasklists",{
    description:"List the current user's Google Tasks lists (one bounded page). Requires Google Tasks read scope.",
    inputSchema:z.object({accountId:ACCOUNT,pageToken:TOKEN,maxResults:SIZE}).strict(),
    annotations:{title:"List Google task lists",readOnlyHint:true}
  },WRAP(args=>service.listTasklists(args)));
  server.registerTool("tasks_list_tasks",{
    description:"List tasks in one Google task list. Dates represent scheduled days, not necessarily deadlines.",
    inputSchema:z.object({accountId:ACCOUNT,tasklistId:ID,pageToken:TOKEN,maxResults:SIZE,
      showCompleted:z.boolean().default(false),showAssigned:z.boolean().default(false)}).strict(),
    annotations:{title:"List Google tasks",readOnlyHint:true}
  },WRAP(args=>service.listTasks(args)));
  server.registerTool("tasks_get_task",{
    description:"Read one Google Task by its task list ID and task ID.",
    inputSchema:z.object({accountId:ACCOUNT,tasklistId:ID,taskId:ID}).strict(),
    annotations:{title:"Get Google task",readOnlyHint:true}
  },WRAP(args=>service.getTask(args)));
  server.registerTool("tasks_create_task",{
    description:"Create one Google Task. Requires Google Tasks write scope AND a separate, single-use, exact-action approval issued outside MCP from the local CLI. The model cannot approve its own action. A scheduled date is not a deadline.",
    inputSchema:z.object({accountId:ACCOUNT,tasklistId:ID,
      title:z.string().trim().min(1).max(1024),
      notes:z.string().max(8192).optional(),
      scheduledDate:z.iso.date().optional()}).strict(),
    annotations:{title:"Create approved Google task",readOnlyHint:false,
      destructiveHint:false,idempotentHint:false}
  },WRAP(args=>service.createTask(args)));
  return server;
}
