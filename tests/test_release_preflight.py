"""QA checks for candidate integrity; publishing must remain blocked by default."""
import json
from pathlib import Path
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
from release_preflight import audit

XPI=ROOT/"dist"/"workspace-ai-alpha-unsigned.xpi"

class TestReleasePreflight(unittest.TestCase):
    def test_candidate_integrity_passes_but_is_not_signed(self):
        result=audit(XPI,"v0.14.0")
        self.assertFalse(result["errors"],result["errors"])
        self.assertFalse(result["signed"])
        self.assertFalse(result["published"])
        self.assertFalse(result["publishReady"])
        self.assertGreater(result["bytes"],1000)
        self.assertEqual(len(result["sha256"]),64)
        self.assertGreater(result["files"],10)
        self.assertIn("google_oauth_live_test",result["blockers"])

    def test_version_mismatch_rejected(self):
        result=audit(XPI,"v0.13.5")
        self.assertTrue(any("do not match" in x for x in result["errors"]))

    def test_unverified_public_signing_is_blocked(self):
        result=audit(XPI,"v0.14.0",publish=True)
        self.assertFalse(result["publishReady"])
        self.assertTrue(any("blocked" in x for x in result["errors"]))

    def test_source_manifest_discloses_optional_data(self):
        manifest=json.loads((ROOT/"manifest.json").read_text())
        data=manifest["browser_specific_settings"]["gecko"]["data_collection_permissions"]
        self.assertEqual(data["required"],["none"])
        for category in ("authenticationInfo","personalCommunications",
                         "personallyIdentifyingInfo","websiteContent"):
            self.assertIn(category,data["optional"])

if __name__=="__main__":
    unittest.main()
