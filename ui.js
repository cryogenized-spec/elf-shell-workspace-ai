/* Shared user interface for Workspace Hub and native Firefox sidebar. */
"use strict";
const list = document.querySelector("#resource-list");
const status = document.querySelector("#status");
function announce(text, error=false) {
  status.textContent=text;
  status.classList.toggle("error",error);
}
async function request(payload) {
  const result = await browser.runtime.sendMessage(payload);
  if (!result || !result.ok) throw new Error(result?.error || "Extension unavailable");
  return result;
}
function node(tag,className,text) {
  const el=document.createElement(tag);
  if(className) el.className=className;
  if(text!==undefined) el.textContent=text;
  return el;
}
function makeResourceCard(item) {
  const row=node("article","resource-row");
  const body=node("div","resource-main");
  const name=node("strong","",item.name);
  const url=node("small","",item.url);
  body.append(name,url);
  const actions=node("div","resource-actions");
  const open=node("button","mini","↗ Open");
  open.type="button";
  open.title="Switch to existing tab or open this resource";
  open.addEventListener("click",async()=>{
    open.disabled=true;
    try {
      const response=await request({type:"OPEN_RESOURCE",key:item.key});
      announce(response.result.reused?"Switched to existing tab.":"Opened resource in Firefox.");
    } catch(error){announce(error.message,true);}
    finally{open.disabled=false;}
  });
  actions.append(open);
  if(document.body.dataset.view==="hub") {
    const remove=node("button","mini danger","×");
    remove.type="button";remove.title="Remove from workspace list (does not close tabs)";
    remove.setAttribute("aria-label","Remove "+item.name);
    remove.addEventListener("click",async()=>{
      remove.disabled=true;
      try{
        const result=await request({type:"REMOVE_RESOURCE",key:item.key});
        render(result.resources);announce("Removed from your Workspace profile. Open tabs were not closed.");
      }catch(error){announce(error.message,true);}finally{remove.disabled=false;}
    });
    actions.append(remove);
  }
  row.append(body,actions);
  return row;
}
function render(items) {
  list.replaceChildren();
  items.forEach(item=>list.append(makeResourceCard(item)));
  if (!items.length) list.append(node("p","quiet","No Google resources saved."));
  const count=document.querySelector("#count");
  if(count) count.textContent=String(items.length).padStart(2,"0");
}
async function refresh(){
  try{const result=await request({type:"GET_STATE"});render(result.resources);}
  catch(error){announce(error.message,true);}
}
document.querySelector("#launch").addEventListener("click",async(event)=>{
  const button=event.currentTarget;button.disabled=true;announce("Preparing Workspace tabs…");
  try {
    const response=await request({type:"OPEN_WORKSPACE"});
    const r=response.result;
    announce("Workspace ready · "+r.opened+" opened · "+r.reused+" reused"+
      (r.outsideWindow.length?" · "+r.outsideWindow.length+" kept in other windows":""));
  }catch(error){announce(error.message,true);}
  finally{button.disabled=false;}
});
const form=document.querySelector("#resource-form");
if(form) form.addEventListener("submit",async(event)=>{
  event.preventDefault();
  const button=form.querySelector("button");
  button.disabled=true;
  try{
    const result=await request({type:"SAVE_RESOURCE",name:form.querySelector("#name").value,url:form.querySelector("#url").value});
    render(result.resources);form.reset();announce("Google resource saved. It will open or be reused at next launch.");
  }catch(error){announce(error.message,true);}
  finally{button.disabled=false;}
});
refresh();