"""Regression checks for published version and honest acceptance documentation.

These tests do not perform live Google API calls and do not approve release gates.
"""
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class DocumentationStatusTests(unittest.TestCase):
    def test_readme_status_matches_both_manifest_and_package(self):
        manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
        package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        self.assertEqual(manifest["version"], package["version"])
        self.assertIn("**Status: v" + manifest["version"] + " developer preview", readme)
        self.assertIn("docs/google-live-acceptance.md", readme)
        self.assertNotIn("Gmail access is not implemented.", readme)
        self.assertNotIn("This flow has not been live-tested.", readme)

    def test_google_scope_status_has_no_unearned_live_passes(self):
        matrix = (ROOT / "docs/google-live-acceptance.md").read_text(encoding="utf-8")
        for test_case in ("G00", "G01", "G02", "G03", "G04", "G05", "G06", "G07"):
            self.assertIn(test_case, matrix)
        self.assertIn("User-reported", matrix)
        self.assertIn("NOT RUN", matrix)
        self.assertIn("not a real-account api acceptance", matrix.lower())
        self.assertIn("No complete live acceptance", matrix)
        self.assertIn("42468593339", matrix)
        self.assertIn("42468423712", matrix)
        # Do not allow an automatic CI result to masquerade as Google authorization.
        self.assertNotRegex(matrix, r"\| G0[3456] .*\| PASS \|")

    def test_release_gates_need_explicit_evidence_for_approval(self):
        gates = json.loads((ROOT / "release-gates.json").read_text(encoding="utf-8"))
        self.assertEqual(gates["schema"], 1)
        for name, entry in gates.items():
            if name == "schema":
                continue
            self.assertIsInstance(entry["approved"], bool)
            if entry["approved"]:
                self.assertRegex(str(entry.get("evidence_url") or ""), r"^https://")
                self.assertNotIn("github.com/cryogenized-spec/elf-shell-workspace-ai/actions/runs/42468593339", entry["evidence_url"], "CI-only cannot approve a live Google scope")


if __name__ == "__main__":
    unittest.main()
