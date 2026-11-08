#!/usr/bin/env bash
# Isolated Firefox device preflight. No OAuth sign-in or paid AI calls.
# Usage: bash scripts/run-local-firefox-preflight.sh
# Overrides: SELENIUM_PYTHON=/path/to/python FIREFOX_BINARY=/path/to/firefox
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

firefox_binary="${FIREFOX_BINARY:-/usr/bin/firefox}"
selenium_python="${SELENIUM_PYTHON:-$HOME/.venvs/elfshell-firefox/bin/python}"

if [[ ! -x "$firefox_binary" ]]; then
  printf 'ERROR: Firefox executable not found: %s\n' "$firefox_binary" >&2
  printf 'Set FIREFOX_BINARY to the installed Firefox binary path.\n' >&2
  exit 2
fi

if [[ ! -x "$selenium_python" ]]; then
  printf 'ERROR: Selenium virtualenv Python missing: %s\n' "$selenium_python" >&2
  printf 'Create a virtualenv and install selenium, or set SELENIUM_PYTHON.\n' >&2
  exit 2
fi

if ! "$selenium_python" -c 'from selenium import webdriver; assert hasattr(webdriver.Firefox,"install_web_extension")' >/dev/null 2>&1; then
  printf 'ERROR: Selenium 4.52+ with install_web_extension is required in %s\n' "$selenium_python" >&2
  exit 2
fi

if ! command -v npm >/dev/null 2>&1; then
  printf 'ERROR: npm is required for the local unit tests and XPI package step.\n' >&2
  exit 2
fi

printf 'ELF//SHELL Workspace AI: local Firefox preflight\n'
printf 'Firefox: %s\n' "$("$firefox_binary" --version)"
printf 'Selenium: %s\n' "$("$selenium_python" -c 'import selenium;print(selenium.__version__)')"
printf 'Environment: temporary unsigned extension, isolated headless Firefox profile\n'
printf 'External Google OAuth and BYOK model inference: NOT tested\n\n'

npm test
npm run package

# The native suite creates its own Firefox profile, installs an unsigned
# add-on temporarily, runs mock/unconnected controls, then closes Firefox.
FIREFOX_BINARY="$firefox_binary" "$selenium_python" tests/native_firefox.py

# Report only test status and counts. Never print extension storage,
# request headers, browser session credentials or full account content.
"$selenium_python" - <<'PY'
import json
from pathlib import Path

p = Path("dist/native-firefox/report.json")
report = json.loads(p.read_text(encoding="utf-8"))
checks = report.get("checks", [])
passed = sum(item.get("status") == "PASS" for item in checks)
print()
print("Device preflight:", report.get("status", "UNKNOWN"))
print("Firefox version:", report.get("firefoxVersion", "unknown"))
print(f"Local automated checks: {passed}/{len(checks)} passed")
print("Privacy: No Google account connection or paid AI inference was attempted.")
print("Next: Complete separately authorized G00–G07 live acceptance; keep release gates unapproved.")
PY
