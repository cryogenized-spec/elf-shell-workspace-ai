"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const Coffee=require("../briefing/engine.js");
const instant=Date.parse("2026-11-07T09:00:00Z");
test("Morning Coffee ranks upcoming appointments and scheduled Tasks without inventing deadlines",()=>{
  const today=Coffee.localDay(instant);
  const older="2026-11-01";
  const sample={
    calendar:{events:[
      {id:"soon",title:"Supplier briefing",start:"2026-11-07T11:00:00+02:00",
       end:"2026-11-07T12:00:00+02:00",sourceUrl:"https://www.google.com/calendar/event?eid=abc"},
      {id:"done",title:"Early meeting",start:"2026-11-07T08:00:00+02:00",
       end:"2026-11-07T09:00:00+02:00"}
    ],limited:false},
    tasks:{lists:[{list:"Maintenance",tasks:[
      {id:"a",title:"Inspect stock",due:older+"T00:00:00Z",status:"needsAction",
       sourceUrl:"https://tasks.google.com/task/abc"},
      {id:"b",title:"Check dispatch",due:today+"T00:00:00Z",status:"needsAction"},
      {id:"c",title:"Future work",due:"2027-01-01T00:00:00Z"},
      {id:"d",title:"Completed",status:"completed"}
    ]}],limited:false},errors:[]
  };
  const got=Coffee.compile(sample,instant);
  assert.equal(got.counts.events,2);
  assert.equal(got.counts.tasks,3);
  assert.equal(got.aiUsed,false);
  assert.equal(got.gmailIncluded,false);
  assert.equal(got.attention[0].title,"Inspect stock");
  assert.match(got.attention[0].attention,/Scheduled before today/);
  assert(!got.attention[0].attention.includes("Overdue"));
  assert(got.attention.find(x=>x.id==="soon").priority>=80);
  assert.deepEqual(got.sources,["Calendar","Tasks"]);
});
test("only genuine Google event and task links can be opened",()=>{
  assert.equal(Coffee.safeSourceLink("javascript:alert(1)","calendar"),null);
  assert.equal(Coffee.safeSourceLink("https://calendar.google.com.evil.com/event/abc","calendar"),null);
  assert.equal(Coffee.safeSourceLink("https://user:password@calendar.google.com/event","calendar"),null);
  assert.equal(Coffee.safeSourceLink("https://evil.example/task","tasks"),null);
  assert.equal(Coffee.safeSourceLink("https://www.google.com/calendar/event?eid=abc","calendar"),
    "https://www.google.com/calendar/event?eid=abc");
  assert.equal(Coffee.safeSourceLink("https://tasks.google.com/task/abc","tasks"),
    "https://tasks.google.com/task/abc");
});
test("explicit shared document IDs are correlated, without claiming a shared project",()=>{
  const shared="https://docs.google.com/document/d/DOC12345678/edit";
  const got=Coffee.compile({calendar:{events:[
    {id:"c",title:"Quote discussion",start:"2026-11-07T12:00:00Z",description:"Review "+shared}
  ]},tasks:{lists:[{list:"Follow up",tasks:[
    {id:"t",title:"Review quotation",notes:shared+" and check pricing"}
  ]}]},errors:[]},instant);
  assert.equal(got.connections.length,1);
  assert.equal(got.connections[0].fileKey,"file:document:DOC12345678");
  assert.equal(got.connections[0].strength,"explicit-reference");
  assert.match(got.connections[0].explanation,/does not prove/);
});
test("a source not returned is never labelled fully checked",()=>{
  const got=Coffee.compile({calendar:null,tasks:null,errors:[
    {service:"Calendar",message:"not authorized"},
    {service:"Tasks",message:"no permission"}
  ]},instant);
  assert.equal(got.partial,true);
  assert.equal(got.sources.length,0);
  assert.equal(got.attention.length,0);
  assert.equal(got.errors.length,2);
  assert(got.notices.some(x=>x.includes("No Gmail")));
});
test("calendar cancellation and completed tasks are not falsely highlighted",()=>{
  const result=Coffee.compile({calendar:{events:[
    {status:"cancelled",id:"no",title:"Cancelled",start:"2026-11-07"}
  ]},tasks:{lists:[{list:"To Do",tasks:[{status:"completed",id:"done",title:"Finished"}]}]},errors:[]},instant);
  assert.equal(result.counts.events,0);
  assert.equal(result.counts.tasks,0);
});
