"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const base=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(base,p),"utf8");
const css=read("ui.css"),svg=read("icons/ayarime-rose-outline.svg");
const mark=page=>read(page).match(/<span class="ayarime-rose-loader"[\s\S]*?<\/span>\s*<strong id="ai-reasoning-label">/)?.[0];
test("original rose artwork is a safe, self-hosted vector and included in the XPI",()=>{
  assert.match(svg,/<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  assert.match(svg,/viewBox="0 0 128 128"/);
  assert.match(svg,/Ayarime rose seal/);
  assert.match(svg,/<path d="M63 23/);
  assert(!/<script|<image|foreignObject|onload=|javascript:|https?:\/\//i.test(svg.replace('xmlns="http://www.w3.org/2000/svg"','')),
    "Rose asset must not load remote content or embed executable code");
  assert(read("scripts/package.py").includes('"icons/ayarime-rose-outline.svg"'));
  assert(css.includes('url("icons/ayarime-rose-outline.svg")'));
});
test("Hub and sidebar share the same 2x2 rose seal markup, in the requested order",()=>{
  const hub=mark("hub.html"),side=mark("sidebar.html");
  assert(hub&&side,"Loader needs to be mounted in both AI views");
  assert.equal(hub,side,"Both UIs must use the same original component markup");
  const right=hub.indexOf("rose-tile--right"),down=hub.indexOf("rose-tile--down");
  const left=hub.indexOf("rose-tile--left"),up=hub.indexOf("rose-tile--up");
  assert(right>=0&&right<down&&down<left&&left<up);
  assert.match(hub,/rose-spirit/);
  for(const tint of ["cyan","pink","violet","gold"])assert(hub.includes("rose-spark--"+tint));
  assert(hub.includes('aria-hidden="true"'),"Decorative loader must not duplicate spoken status");
  for(const page of ["hub.html","sidebar.html"])assert(read(page).includes('id="ai-reasoning-label"'));
});
test("four tiles fold right/down/left/up and return in reverse before the next cycle",()=>{
  const expected={
    right:[8,14,76,83],
    down:[14,20,69,76],
    left:[20,26,62,69],
    up:[26,32,55,62]
  };
  for(const [direction,[leave,atOuter,backStart,atHome]] of Object.entries(expected)){
    const re=new RegExp("@keyframes rose-fold-"+direction+"\\{([^}]+)\\}([^}]+)\\}");
    const m=css.match(re);
    assert(m,"Fold keyframes missing for "+direction);
    const body=m[0];
    assert(body.includes(leave+"%")&&body.includes(atOuter+"%")&&
      body.includes(backStart+"%")&&body.includes(atHome+"%"),
      direction+" is not sequenced correctly");
  }
  assert.match(css,/@keyframes rose-alternate-axes/);
  assert(css.includes("rotateX(-360deg)"),"First loop must flip about X axis");
  assert(css.includes("rotateY(360deg)"),"Second loop must flip about Y axis");
  assert(css.includes("calc(var(--rose-cycle) * 2)"),"Axes should alternate across two tile cycles");
  assert(css.includes("--rose-cycle:3.8s"),"A complete four-tile cycle needs deliberate timing");
});
test("animation requires an active stream and respects reduced-motion settings",()=>{
  assert(css.includes('.trace-board:is([data-stage="connecting"],[data-stage="thinking"],[data-stage="answering"]) .rose-spirit'));
  assert(css.includes("@media(prefers-reduced-motion:reduce)"));
  assert(css.includes(".rose-tile{transform:none!important;opacity:1!important}"));
  assert(css.includes(".rose-spirit,.rose-spark{opacity:0!important}"));
  assert(!read("ui-trace.js").includes("setTimeout("),"Loader must not create JS timers");
  assert(!css.includes("rose-seal-grid{position:fixed"),"Loader should remain within reasoning header");
});
