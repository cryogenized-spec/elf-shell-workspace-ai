#!/usr/bin/env python3
"""Build a self-contained unsigned Firefox development XPI (zip format)."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
ROOT = Path(__file__).resolve().parents[1]
FILES = ["manifest.json","background.js","shared/workspace.js","shared/persona.js","google/oauth.js","google/login-ui.js","google/read.js","google/files.js","google/catalog.js","briefing/engine.js","google/session.js","google/master-read-client.js","google/master-oauth.js","google/master-ui.js","ai/providers.js","ai/openai-complimentary.js","diagnostics/connection.js","ai/session.js","ai/transcript.js","ai/context.js","ai/openai-stream.js","updater/release.js","updater/checker.js","hub.html","sidebar.html","ui-trace.js","ui-conversation.js","ui.js","ui.css","icons/mark.svg","icons/ayarime-rose-outline.svg"]
DEST = ROOT / "dist" / "extension"
DEST.mkdir(parents=True,exist_ok=True)
for relative in FILES:
    target=DEST / relative
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_bytes((ROOT / relative).read_bytes())
with ZipFile(ROOT/"dist"/"workspace-ai-alpha-unsigned.xpi","w",ZIP_DEFLATED,compresslevel=9) as z:
    for relative in FILES:
        z.write(ROOT / relative,relative)
print("Unsigned development XPI:", (ROOT/"dist"/"workspace-ai-alpha-unsigned.xpi").stat().st_size, "bytes")
