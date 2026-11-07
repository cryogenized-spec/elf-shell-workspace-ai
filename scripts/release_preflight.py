#!/usr/bin/env python3
"""Release-candidate integrity/approval audit. Does not sign, upload or publish."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import sys
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
VERSION = re.compile(r"^v?([0-9]+)\.([0-9]+)\.([0-9]+)$")
PUBLIC_GATES = (
    "google_oauth_live_test",
    "byok_provider_live_test",
    "mozilla_privacy_and_consent_review",
    "firefox_signed_install_and_upgrade",
    "distribution_channel_decision",
)
REQUIRED_OPTIONAL_DATA = {
    "authenticationInfo", "personalCommunications",
    "websiteContent", "personallyIdentifyingInfo",
}

def audit(package: Path, tag: str, publish: bool = False) -> dict:
    report = {"schema": 1, "tag": tag, "candidate": True, "signed": False,
              "published": False, "publishReady": False,
              "errors": [], "blockers": [], "files": 0}
    errors = report["errors"]
    version_match = VERSION.fullmatch(tag)
    package = Path(package)
    if not version_match:
        errors.append("Release tag must be a strict vMAJOR.MINOR.PATCH, not a preview or branch")
    if not package.is_file():
        errors.append("Unsigned candidate XPI is missing")
        return report
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf8"))
    package_manifest = json.loads((ROOT / "package.json").read_text(encoding="utf8"))
    if not version_match or manifest.get("version") != ".".join(version_match.groups()):
        errors.append("Tag and extension manifest versions do not match")
    if package_manifest.get("version") != manifest.get("version"):
        errors.append("Node package and extension manifest versions do not match")
    gecko = manifest.get("browser_specific_settings", {}).get("gecko", {})
    if gecko.get("id") != "workspace-ai@elf-shell.local":
        errors.append("Extension ID has changed")
    data = gecko.get("data_collection_permissions", {})
    if data.get("required") != ["none"]:
        errors.append("Unexpected required data permissions; independent review needed")
    if not REQUIRED_OPTIONAL_DATA.issubset(set(data.get("optional", []))):
        errors.append("Optional Mozilla data-sharing declarations are missing")
    if "http:" in str(manifest.get("content_security_policy", {})):
        errors.append("Manifest content security policy must not include http origins")
    if manifest.get("update_url") or gecko.get("update_url"):
        errors.append("External updater must not override native AMO distribution")
    import ast
    package_src = (ROOT / "scripts/package.py").read_text(encoding="utf8")
    match = re.search(r"^FILES\s*=\s*(\[.*?\])", package_src, re.M | re.S)
    if match is None:
        errors.append("Could not parse the exact extension packaging allowlist")
        return report
    allowed = ast.literal_eval(match.group(1))
    if not isinstance(allowed, list) or len(set(allowed)) != len(allowed):
        errors.append("Invalid or duplicated package allowlist")
        return report
    with ZipFile(package) as archive:
        names = archive.namelist()
        if set(names) != set(allowed) or len(names) != len(allowed):
            errors.append("XPI contents do not exactly match the source allowlist")
        for member in archive.infolist():
            name = member.filename
            if name.startswith("/") or ".." in Path(name).parts or "\\" in name:
                errors.append("Unsafe archive file name: " + name)
                continue
            source = ROOT / name
            if not source.is_file():
                errors.append("Missing source file for packaged path: " + name)
                continue
            if archive.read(name) != source.read_bytes():
                errors.append("Packaged file differs from source: " + name)
            if member.file_size > 2 * 1024 * 1024:
                errors.append("Unexpected oversized extension file: " + name)
        report["files"] = len(names)
    report["bytes"] = package.stat().st_size
    report["sha256"] = hashlib.sha256(package.read_bytes()).hexdigest()
    gates = json.loads((ROOT / "release-gates.json").read_text(encoding="utf8"))
    for name in PUBLIC_GATES:
        entry = gates.get(name, {})
        evidence = entry.get("evidence_url")
        approved = entry.get("approved") is True
        verified_link = isinstance(evidence, str) and evidence.startswith(
            "https://github.com/cryogenized-spec/elf-shell-workspace-ai/issues/"
        )
        if not (approved and verified_link):
            report["blockers"].append(name)
    report["publishReady"] = not report["blockers"] and not errors
    if publish and report["blockers"]:
        errors.append("Public signing/release blocked: outstanding independent acceptance gates")
    return report

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--package", default="dist/workspace-ai-alpha-unsigned.xpi")
    parser.add_argument("--tag", required=True)
    parser.add_argument("--require-publish-ready", action="store_true")
    parser.add_argument("--report", default="dist/release-candidate-report.json")
    args = parser.parse_args()
    result = audit(ROOT / args.package, args.tag, args.require_publish_ready)
    destination = ROOT / args.report
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(result, indent=2) + "\n", encoding="utf8")
    print("Candidate integrity:", "PASS" if not result["errors"] else "FAIL")
    print("Signed:", False, "published:", False, "publish ready:", result["publishReady"])
    print("XPI bytes:", result.get("bytes", "n/a"), "sha256:", result.get("sha256", "n/a"))
    if result["blockers"]:
        print("Outstanding release gates:", ", ".join(result["blockers"]))
    for item in result["errors"]:
        print("ERROR:", item, file=sys.stderr)
    return 1 if result["errors"] else 0

if __name__ == "__main__":
    raise SystemExit(main())
