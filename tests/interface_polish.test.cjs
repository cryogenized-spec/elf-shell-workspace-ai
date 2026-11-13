"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
const hub=read("hub.html"),sidebar=read("sidebar.html"),css=read("ui.css"),ui=read("ui.js");
test("Hub assistant shortcut has both a static hash target and a JS prompt focus route",()=>{
  assert.match(hub, /class="assistant-quick-link" href="#assistant"/);
  assert.match(hub, /id="assistant" class="assistant-route-anchor"/);
  assert.match(hub, /id="ai-console" tabindex="-1"/);
  assert.match(ui, /location\.hash!=="#assistant"/);
  assert.match(ui, /prompt\.focus\(\{preventScroll:true\}\)/);
});
test("sidebar jump-to-chat is keyboard accessible and targets the actual AI console",()=>{
  assert.match(sidebar, /<nav class="sidebar-chat-nav" aria-label="Quick navigation">/);
  assert.match(sidebar, /href="#ai-console"/);
  assert.match(sidebar, /id="ai-console" class="frame ai-console" tabindex="-1"/);
  assert.match(css, /\.sidebar-chat-nav a:focus-visible/);
  assert.match(css, /a:focus-visible,select:focus-visible,textarea:focus-visible,summary:focus-visible/);
});
test("sidebar collapses redundant provider settings without hiding the conversation composer",()=>{
  const d=sidebar.indexOf('<details class="sidebar-provider-details">');
  const end=sidebar.indexOf("</details>",d);
  const form=sidebar.indexOf('id="ai-settings-form"'),key=sidebar.indexOf('id="ai-key-controls"');
  const offer=sidebar.indexOf('id="ai-offer-panel"'),conversation=sidebar.indexOf('id="ai-conversation-list"');
  const prompt=sidebar.indexOf('id="ai-prompt"');
  assert(d>0&&end>d&&form>d&&form<end&&key>d&&key<end&&offer>d&&offer<end);
  assert(conversation>end&&prompt>end,"Chat and local history must remain outside collapsed configuration");
  assert(!sidebar.slice(d,end).includes("<details"),"Avoid nested settings details");
  assert.match(sidebar, /<summary>Provider, model &amp; API key settings<\/summary>/);
  assert.match(css, /\.sidebar-provider-details>summary/);
});
test("Hub and sidebar remain independent documents with unique control ids",()=>{
  for(const [name,page] of [["Hub",hub],["Sidebar",sidebar]]){
    const ids=[...page.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
    assert.equal(new Set(ids).size,ids.length,name+" has duplicated ids");
    for(const id of ["ai-conversation-list","ai-prompt","ai-send","ai-context-enable","ai-trace","ai-reasoning-label","ai-output"]){
      assert(ids.includes(id),name+" missing "+id);
    }
    assert.match(page, /class="ayarime-rose-loader" aria-hidden="true"/);
  }
  assert.match(sidebar, /ALPHA 0\.14/);
});
test("reduced-motion, responsive defaults and focus indications are CSS only",()=>{
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css, /\.ayarime-rose-loader \*\{animation:none!important;transition:none!important\}/);
  assert.match(css, /@media\(max-width:850px\)\{\.columns\{grid-template-columns:1fr\}/);
  assert.match(css, /@media\(max-width:350px\)\{\.side-shell\{padding:8px\}/);
  assert.match(css, /\.sidebar-provider-details\{min-width:0;max-width:100%/);
  assert(!hub.includes('src="https://')&&!sidebar.includes('src="https://'),"Visual assets must be locally bundled");
});
