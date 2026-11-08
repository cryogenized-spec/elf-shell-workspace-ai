/* UI-only Firefox OAuth launch helper: reuse the proven two-option API call.
   Never log or return authorization URLs or one-time codes in errors. */
(function(root){
  "use strict";
  function launch(browserApi,authorizationUrl){
    if(typeof authorizationUrl!=="string"||authorizationUrl.length>8192)
      throw Error("oauth-auth-url-invalid");
    let parsed;
    try{parsed=new URL(authorizationUrl);}
    catch{throw Error("oauth-auth-url-invalid");}
    if(parsed.origin!=="https://accounts.google.com" ||
       parsed.pathname!=="/o/oauth2/v2/auth" ||
       parsed.searchParams.get("response_type")!=="code" ||
       !parsed.searchParams.has("redirect_uri"))
      throw Error("oauth-auth-url-invalid");
    if(typeof browserApi?.identity?.launchWebAuthFlow!=="function")
      throw Error("oauth-identity-api-unavailable");
    // The redirect_uri is already inside the Google authorization URL.
    // Firefox's standard API does not require an additional details field.
    // Do not echo details or the returned redirect: both may contain secrets.
    return browserApi.identity.launchWebAuthFlow({
      interactive:true,
      url:authorizationUrl
    });
  }
  function safeStartFailure(error){
    if(error?.message==="oauth-auth-url-invalid")
      return "AUTH_START_INVALID_REQUEST · The prepared Google authorization "+
        "request is invalid. Save the client ID and Prepare sign-in again.";
    if(error?.message==="oauth-identity-api-unavailable")
      return "AUTH_START_IDENTITY_UNAVAILABLE · Firefox's identity API is "+
        "unavailable in this extension profile. Check the installed test "+
        "extension and its identity permission.";
    return "AUTH_START_BROWSER_REJECTED · Firefox rejected the authorization "+
      "launch before opening Google. Prepare sign-in again. "+
      "Check the Firefox extension debugging console if the error persists.";
  }
  root.WorkspaceGoogleLogin={launch,safeStartFailure};
  if(typeof module!=="undefined"&&module.exports)
    module.exports=root.WorkspaceGoogleLogin;
})(globalThis);
