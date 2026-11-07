/* Metadata-only GitHub Releases checker: never downloads or executes extension code. */
(function(root) {
  "use strict";
  const REPO="cryogenized-spec/elf-shell-workspace-ai";
  const ORIGIN="https://api.github.com";
  const API_URL=ORIGIN+"/repos/"+REPO+"/releases?per_page=10";
  const RELEASE_PREFIX="https://github.com/"+REPO+"/releases/tag/";
  const CHECK_EVERY_MINUTES=24*60;
  function parseVersion(input) {
    if(typeof input!=="string"||input.length>80)return null;
    const match=input.trim().match(/^v?(\d{1,7})\.(\d{1,7})\.(\d{1,7})(?:-([A-Za-z0-9.-]{1,40}))?$/);
    if(!match)return null;
    const parts=[Number(match[1]),Number(match[2]),Number(match[3])];
    if(parts.some(n=>!Number.isSafeInteger(n)))return null;
    return {parts,pre:match[4]||null};
  }
  function compareVersion(a,b){
    const left=parseVersion(a),right=parseVersion(b);
    if(!left||!right)throw Error("Unsupported release version");
    for(let i=0;i<3;i++)if(left.parts[i]!==right.parts[i])return Math.sign(left.parts[i]-right.parts[i]);
    if(!left.pre && right.pre)return 1;
    if(left.pre && !right.pre)return -1;
    if(left.pre&&right.pre)return Math.sign(left.pre.localeCompare(right.pre));
    return 0;
  }
  function validateRelease(raw){
    if(!raw||typeof raw!=="object"||raw.draft===true||
       typeof raw.tag_name!=="string"||!parseVersion(raw.tag_name))return null;
    const tag=raw.tag_name;
    const expected=RELEASE_PREFIX+encodeURIComponent(tag);
    if(raw.html_url!==expected)return null;
    const latest={version:tag,url:expected,
      title:typeof raw.name==="string"?raw.name.slice(0,120):"",
      notes:typeof raw.body==="string"?raw.body.slice(0,500):"",
      publishedAt:typeof raw.published_at==="string"?raw.published_at.slice(0,40):"",
      prerelease:raw.prerelease===true};
    return latest;
  }
  function latestFor(releases,current,channel="stable") {
    if(!Array.isArray(releases))throw Error("Unexpected GitHub release response");
    if(channel!=="stable"&&channel!=="preview")throw Error("Unknown release channel");
    const valid=releases.slice(0,30).map(validateRelease).filter(Boolean)
      .filter(item=>channel==="preview"||!item.prerelease);
    valid.sort((a,b)=>compareVersion(b.version,a.version));
    const latest=valid[0]||null;
    return {latest,newer:Boolean(latest&&compareVersion(latest.version,current)>0)};
  }
  root.WorkspaceReleaseUtils={REPO,ORIGIN,API_URL,RELEASE_PREFIX,CHECK_EVERY_MINUTES,
    parseVersion,compareVersion,validateRelease,latestFor};
  if(typeof module!=="undefined"&&module.exports)module.exports=root.WorkspaceReleaseUtils;
})(globalThis);
