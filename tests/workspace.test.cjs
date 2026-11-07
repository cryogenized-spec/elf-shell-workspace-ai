const test=require("node:test");
const assert=require("node:assert/strict");
const {DEFAULT_RESOURCES,normalizeResource,resourceKey,matchesTab}=require("../shared/workspace.js");
test("only allowed Google HTTPS origins are accepted",()=>{
  for(const url of ["javascript:alert(1)","http://docs.google.com/document/u/0/","https://evil.com/","https://docs.google.com.evil.org/spreadsheets/d/abcde/edit","https://user:pass@docs.google.com/document/u/0/"]){
    assert.throws(()=>normalizeResource("Test",url));
  }
});
test("file IDs match regardless of editor route or query parameters",()=>{
  const saved=normalizeResource("Workshop Stock Register","https://docs.google.com/spreadsheets/d/1vCjLY-7dZIa8epWQZAtrhYRmHwwep4dELhICOgqrxw4/edit?gid=1");
  assert.equal(saved.key,"file:spreadsheets:1vCjLY-7dZIa8epWQZAtrhYRmHwwep4dELhICOgqrxw4");
  assert.equal(matchesTab(saved,{url:"https://docs.google.com/spreadsheets/d/1vCjLY-7dZIa8epWQZAtrhYRmHwwep4dELhICOgqrxw4/edit#gid=200"}),true);
  assert.equal(matchesTab(saved,{url:"https://docs.google.com/spreadsheets/d/DIFFERENT12345/edit"}),false);
});
test("app home matches an already open editor tab",()=>{
  const home=normalizeResource("Sheets",DEFAULT_RESOURCES.find(x=>x.name==="Sheets").url);
  assert.equal(resourceKey(home.url),"app:sheets");
  assert.equal(matchesTab(home,{url:"https://docs.google.com/spreadsheets/d/abc12345678/edit"}),true);
});
test("invalid names and non Google tab URLs cannot match",()=>{
  assert.throws(()=>normalizeResource(" ","https://drive.google.com/drive/"));
  assert.equal(matchesTab(normalizeResource("Drive","https://drive.google.com/drive/u/0/my-drive"),{url:"https://example.com"}),false);
});
test("no duplicate default resource keys",()=>{
  const keys=DEFAULT_RESOURCES.map(r=>normalizeResource(r.name,r.url).key);
  assert.equal(new Set(keys).size,keys.length);
});