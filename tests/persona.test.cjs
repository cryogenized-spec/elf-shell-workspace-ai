"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const persona=require("../shared/persona.js");

test("default Ayarime character is available without AI credentials",()=>{
  assert.equal(persona.DEFAULT.mode,"ayarime");
  assert.match(persona.stylePrompt(persona.DEFAULT),/Ayarime/);
  assert.match(persona.stylePrompt(persona.DEFAULT),/precise/);
});
test("professional preset does not impersonate Ayarime",()=>{
  const value=persona.stylePrompt({mode:"professional",customPrompt:""});
  assert.match(value,/professional productivity assistant/);
  assert(!value.includes("cyber-elf"));
});
test("custom prompt can be selected without loosening tool access controls",()=>{
  assert.equal(persona.stylePrompt({mode:"custom",customPrompt:"  Friendly yet concise  "}),"Friendly yet concise");
  assert.throws(()=>persona.validate({mode:"custom",customPrompt:""}));
  assert.throws(()=>persona.validate({mode:"custom",customPrompt:"a".repeat(6001)}));
  assert.equal(persona.normalize({mode:"invalid",customPrompt:""}).mode,"ayarime");
});
