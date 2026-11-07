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
        await refresh();announce("Removed from your Workspace profile. Open tabs were not closed.");
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
  if (!items.length) list.append(node("p","quiet","No Google resources saved in this profile."));
  const count=document.querySelector("#count");
  if(count) count.textContent=String(items.length).padStart(2,"0");
}
function renderProfiles(profiles,activeProfileId) {
  const select=document.querySelector("#profile-select");
  if(!select) return;
  select.replaceChildren();
  profiles.forEach(profile=>{
    const option=node("option","",profile.name+" · "+profile.count);
    option.value=profile.id;
    select.append(option);
  });
  select.value=activeProfileId;
  const remove=document.querySelector("#profile-delete");
  if(remove) remove.disabled=activeProfileId==="default"||profiles.length===1;
}
function renderPersona(persona) {
  const mode=document.querySelector("#persona-mode");
  const custom=document.querySelector("#persona-custom");
  const label=document.querySelector("#persona-current-mode");
  if(mode && custom) {
    mode.value=persona.mode;
    custom.value=persona.customPrompt;
    custom.disabled=persona.mode!=="custom";
  }
  if(label) label.textContent=persona.mode==="ayarime"
    ? "Ayarime — Original" : persona.mode==="professional" ? "Professional — Neutral" : "Custom personality";
}
async function refresh(){
  try {
    const result=await request({type:"GET_STATE"});
    render(result.resources);
    renderProfiles(result.profiles,result.activeProfileId);
    const preference=await request({type:"GET_PERSONA"});
    renderPersona(preference.persona);
  } catch(error) {announce(error.message,true);}
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
    await refresh();form.reset();announce("Google resource saved. It will open or be reused at next launch.");
  }catch(error){announce(error.message,true);}
  finally{button.disabled=false;}
});

const profileSelect=document.querySelector("#profile-select");
if(profileSelect) profileSelect.addEventListener("change",async event=>{
  const select=event.currentTarget;select.disabled=true;
  try {
    const result=await request({type:"SELECT_PROFILE",id:select.value});
    render(result.resources);renderProfiles(result.profiles,result.activeProfileId);
    announce("Workspace profile selected. Existing tabs are unchanged.");
  }catch(error){announce(error.message,true);await refresh();}
  finally{select.disabled=false;}
});
const profileForm=document.querySelector("#profile-form");
if(profileForm) {
  const input=profileForm.querySelector("#profile-name");
  profileForm.addEventListener("submit",async event=>{
    event.preventDefault();
    const create=profileForm.querySelector("#profile-create");create.disabled=true;
    try {
      const result=await request({type:"CREATE_PROFILE",name:input.value});
      render(result.resources);renderProfiles(result.profiles,result.activeProfileId);
      input.value="";announce("New empty Workspace profile created and selected.");
    }catch(error){announce(error.message,true);}
    finally{create.disabled=false;}
  });
  profileForm.querySelector("#profile-rename").addEventListener("click",async()=>{
    const button=profileForm.querySelector("#profile-rename");button.disabled=true;
    try{
      const result=await request({type:"RENAME_PROFILE",name:input.value});
      render(result.resources);renderProfiles(result.profiles,result.activeProfileId);
      input.value="";announce("Workspace profile renamed. Open tabs remain unchanged.");
    }catch(error){announce(error.message,true);}finally{button.disabled=false;}
  });
  profileForm.querySelector("#profile-delete").addEventListener("click",async()=>{
    const id=profileSelect.value;
    const label=profileSelect.selectedOptions[0]?.textContent || "this Workspace";
    if(!window.confirm("Delete saved profile "+label+"? Open Firefox tabs will not be closed.")) return;
    const button=profileForm.querySelector("#profile-delete");button.disabled=true;
    try {
      const result=await request({type:"DELETE_PROFILE",id});
      render(result.resources);renderProfiles(result.profiles,result.activeProfileId);
      announce("Saved Workspace profile deleted. All open Firefox tabs were preserved.");
    }catch(error){announce(error.message,true);}finally{await refresh();}
  });
}
const personaForm=document.querySelector("#persona-form");
if(personaForm) {
  const mode=personaForm.querySelector("#persona-mode");
  const custom=personaForm.querySelector("#persona-custom");
  mode.addEventListener("change",()=>{custom.disabled=mode.value!=="custom";});
  personaForm.addEventListener("submit",async event=>{
    event.preventDefault();
    const save=personaForm.querySelector('button[type="submit"]');save.disabled=true;
    try {
      const response=await request({type:"SET_PERSONA",mode:mode.value,customPrompt:custom.value});
      renderPersona(response.persona);
      announce("Ayarime personality saved locally. AI service integration is not enabled yet.");
    }catch(error){announce(error.message,true);}
    finally{save.disabled=false;}
  });
  personaForm.querySelector("#persona-reset").addEventListener("click",async()=>{
    try {
      const response=await request({type:"RESET_PERSONA"});
      renderPersona(response.persona);
      announce("Default Ayarime personality restored.");
    }catch(error){announce(error.message,true);}
  });
}
refresh();