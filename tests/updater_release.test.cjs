"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const U=require("../updater/release.js");
const valid=version=>({
  tag_name:version,html_url:U.RELEASE_PREFIX+encodeURIComponent(version),
  draft:false,prerelease:version.includes("-"),
  published_at:"2026-11-07T12:00:00Z",name:"Release "+version,body:"Summary of fixes"
});
test("version comparator recognizes newer patches and stable-previews",()=>{
  assert.equal(U.compareVersion("v0.9.1","0.9.0"),1);
  assert.equal(U.compareVersion("0.8.0","0.9.0"),-1);
  assert.equal(U.compareVersion("0.9.0","0.9.0"),0);
  assert.equal(U.compareVersion("0.9.0","0.9.0-beta.2"),1);
  assert.equal(U.compareVersion("0.9.0-beta.2","0.9.0"),-1);
  assert.throws(()=>U.compareVersion("latest","0.9.0"));
});
test("release notices require an actual trusted GitHub release, never just a commit",()=>{
  assert.equal(U.latestFor([], "0.9.0").latest,null);
  const input=[valid("v0.9.1"),valid("v0.9.2-beta.1"),valid("v0.9.0")];
  assert.equal(U.latestFor(input,"0.9.0","stable").latest.version,"v0.9.1");
  assert.equal(U.latestFor(input,"0.9.0","preview").latest.version,"v0.9.2-beta.1");
  assert.equal(U.latestFor([valid("v0.8.2")],"0.9.0","stable").newer,false);
});
test("untrusted release URLs, drafts, missing versions and malformed metadata are ignored",()=>{
  assert.equal(U.validateRelease({...valid("v1.0.0"),html_url:"https://evil.example/update.xpi"}),null);
  assert.equal(U.validateRelease({...valid("v1.0.0"),html_url:"https://github.com/cryogenized-spec/other/releases/tag/v1.0.0"}),null);
  assert.equal(U.validateRelease({...valid("v1.0.0"),draft:true}),null);
  assert.equal(U.validateRelease({...valid("latest"),tag_name:"latest"}),null);
  assert.equal(U.validateRelease(null),null);
  assert.equal(U.latestFor([null,{draft:true},valid("v0.9.1")],"0.9.0").newer,true);
});
test("release checker only returns sanitized metadata, not remote executable instructions",()=>{
  const payload=valid("v1.0.0");
  payload.name="New Release "+"X".repeat(600);
  payload.body="<script>run()</script>"+"Y".repeat(600);
  payload.assets=[{browser_download_url:"https://evil.example/script.js"}];
  const candidate=U.validateRelease(payload);
  assert.equal(candidate.title.length,120);
  assert.equal(candidate.notes.length,500);
  assert.equal(candidate.assets,undefined);
  assert(candidate.url.startsWith("https://github.com/"));
});
