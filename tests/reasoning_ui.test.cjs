"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
const root=path.resolve(__dirname,"..");
const script=fs.readFileSync(path.join(root,"ui-trace.js"),"utf8");
class Element{
  constructor(tag="div"){this.tagName=tag;this.hidden=false;this.open=false;this.disabled=false;this.value="";this.dataset={};this.children=[];this.textContent="";this.className="";const classes=new Set();this.classList={add:(x)=>classes.add(x),remove:(x)=>classes.delete(x),toggle:(x,flag)=>flag===undefined?(classes.has(x)?classes.delete(x):classes.add(x)):flag?classes.add(x):classes.delete(x),contains:(x)=>classes.has(x)};}
  replaceChildren(...x){this.children=[...x];this.textContent="";}
  append(...x){this.children.push(...x);}
  setAttribute(name,value){this[name]=value;}
}
function harness(){
  const ids=["ai-output","ai-status","ai-trace","ai-trace-steps","ai-summary-text",
    "ai-summary-status","ai-elapsed","ai-trace-usage","ai-send","ai-cancel",
    "ai-reasoning-label","ai-summary-hint","ai-summary-details","ai-activity-count",
    "ai-activity-details","ai-prompt","ai-model"];
  const nodes=Object.fromEntries(ids.map(x=>[x,new Element()]));
  nodes["ai-model"].value="gpt-6-luna";
  let clock=1000;
  let onMessage,posted;
  const port={
    onMessage:{addListener:fn=>{onMessage=fn;}},
    onDisconnect:{addListener:()=>{}},
    postMessage:message=>{posted=message;},
    disconnect:()=>{}
  };
  const ctx={document:{
      querySelector:selector=>nodes[selector.slice(1)]||null,
      createElement:tag=>new Element(tag),
      createTextNode:text=>({textContent:text})
    },browser:{runtime:{connect:()=>port}},performance:{now:()=>clock},
    setInterval:()=>1,clearInterval:()=>{},Promise};
  vm.createContext(ctx);vm.runInContext(script,ctx);
  return {ctx,nodes,advance:ms=>{clock+=ms},emit:msg=>onMessage(msg),sent:()=>posted};
}
test("Hub and sidebar expose the same honest, expandable reasoning panel",()=>{
  for(const page of ["hub.html","sidebar.html"]){
    const html=fs.readFileSync(path.join(root,page),"utf8");
    for(const id of ["ai-reasoning-label","ai-summary-hint","ai-summary-details",
      "ai-trace-steps","ai-activity-details","ai-activity-count","ai-output-budget"])
      assert(html.includes('id="'+id+'"'),page+" lacks "+id);
    assert(html.includes("Provider reasoning summary"),"Must label summary accurately");
    assert(html.includes("not private internal reasoning"),"Must disclose summary limitations");
    assert(html.includes('value="768" selected'),"Output budget must default to economical 768");
    assert(html.includes('value="2048"')&&html.includes('value="4096"'));
  }
  const style=fs.readFileSync(path.join(root,"ui.css"),"utf8");
  assert(style.includes("prefers-reduced-motion:reduce"));
  assert(style.includes('data-stage="thinking"'));
});
test("thinking streams summaries live, then collapses on answer with accurate time and usage",()=>{
  const h=harness(),n=h.nodes;
  assert.equal(h.ctx.WorkspaceTraceUI.start({text:"Hi",effort:"medium",webSearch:false,
    includeHistory:false,historyLimit:0,maxOutputTokens:768},()=>{}),true);
  assert.equal(n["ai-trace"].dataset.stage,"connecting");
  assert.equal(h.sent().maxOutputTokens,768);
  h.advance(300);
  h.emit({kind:"started",model:"gpt-6-luna",effort:"medium"});
  assert.equal(n["ai-trace"].dataset.stage,"thinking");
  assert.equal(n["ai-reasoning-label"].textContent,"Thinking…");
  h.advance(2700);
  h.emit({kind:"summary",id:"a",text:"**Plan** Test the input",done:false});
  assert(n["ai-summary-text"].children.length>0,"Provider summary should appear during streaming");
  assert.equal(n["ai-summary-hint"].textContent,"STREAMING");
  h.advance(1000);
  h.emit({kind:"answer",id:"m",text:"Here is the answer.",done:false});
  assert.equal(n["ai-trace"].dataset.stage,"answering");
  assert.equal(n["ai-summary-details"].open,false,"Summary should collapse after answer begins");
  assert.equal(n["ai-output"].textContent,"Here is the answer.");
  h.advance(500);
  h.emit({kind:"terminal",status:"completed",usage:{inputTokens:12,outputTokens:88,reasoningTokens:50}});
  assert.equal(n["ai-trace"].dataset.stage,"completed");
  assert.match(n["ai-reasoning-label"].textContent,/Thought for 4\.0s/);
  assert.match(n["ai-trace-usage"].textContent,/internal reasoning 50/);
  assert.match(n["ai-summary-status"].textContent,/not private chain-of-thought/);
});
test("actual tool events render circular, accessible category icons; unknown tools use neutral fallback",()=>{
  const h=harness(),n=h.nodes;
  h.ctx.WorkspaceTraceUI.start({text:"Find docs",effort:"medium",webSearch:true,maxOutputTokens:768},()=>{});
  h.emit({kind:"started",model:"gpt-6-luna",effort:"medium"});
  h.emit({kind:"tool",id:"web-1",title:"Web search",toolType:"web_search_call",state:"active"});
  const web=n["ai-trace-steps"].children.at(-1);
  assert.equal(web.children[0].className,"trace-tool-icon tone-search");
  assert.equal(web.children[0].role,"img");
  assert.match(web.children[0]["aria-label"],/Web search activity icon/);
  h.emit({kind:"tool",id:"mcp-1",title:"MCP tool",toolType:"mcp_call",state:"active"});
  const mcp=n["ai-trace-steps"].children.at(-1);
  assert.equal(mcp.children[0].className,"trace-tool-icon tone-mcp");
  h.emit({kind:"tool",id:"unknown-1",title:"Unknown tool",toolType:"random_untrusted_icon",state:"done"});
  const unknown=n["ai-trace-steps"].children.at(-1);
  assert.equal(unknown.children[0].className,"trace-tool-icon tone-generic");
  assert(!JSON.stringify(unknown.children[0]).includes("http"),"No remote icon URL should be requested");
  assert.equal(unknown.children[0].textContent,"◇","A tool first received as done keeps its category glyph");
  h.emit({kind:"tool",id:"web-1",title:"Web search",toolType:"web_search_call",state:"done"});
  assert.equal(web.children[0].textContent,"⌕","Completed web search must retain its category icon");
  assert.equal(web.classList.contains("done"),true,"A separate completion state is displayed");
  h.emit({kind:"terminal",status:"completed"});
  assert.equal(mcp.children[0].textContent,"⬡","Terminal completion must retain an active tool's category glyph");
  assert.equal(mcp.classList.contains("done"),true);
  assert.equal(n["ai-activity-count"].textContent,"6 events");
});
test("user-expanded summary is not forcibly collapsed; missing summary is never fabricated",()=>{
  const h=harness(),n=h.nodes;
  h.ctx.WorkspaceTraceUI.start({text:"Hi",effort:"none",webSearch:false,maxOutputTokens:768},()=>{});
  h.emit({kind:"started",model:"gpt-6-luna",effort:"none"});
  n["ai-summary-details"].onclick({target:{closest:()=>({tagName:"summary"})}});
  n["ai-summary-details"].open=true;
  h.advance(1900);
  h.emit({kind:"answer",id:"m",text:"Result",done:true});
  assert.equal(n["ai-summary-details"].open,true);
  h.emit({kind:"terminal",status:"completed",usage:{inputTokens:10,outputTokens:10}});
  assert.equal(n["ai-summary-details"].open,true);
  assert.match(n["ai-summary-status"].textContent,/did not expose a reasoning summary/);
  assert.match(n["ai-reasoning-label"].textContent,/Completed in/);
  assert.equal(n["ai-summary-text"].children.length,0);
});
