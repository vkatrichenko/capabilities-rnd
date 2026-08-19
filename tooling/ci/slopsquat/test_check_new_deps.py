#!/usr/bin/env python3
"""Self-tests for check_new_deps. Fully offline — the registry is stubbed.

Every case here corresponds to a claim made in the design note. The two
false-positive cases (link: plugins, short-name neighbours) are the ones
measured against hops' real manifest, and they are the reason those rules
are shaped the way they are.
"""

import datetime as dt
import json
import tempfile
import unittest
from pathlib import Path

import check_new_deps as c

NOW = dt.datetime(2026, 8, 19, tzinfo=dt.timezone.utc)


def pkg(created_days_ago=None, versions=1, repo=True):
    meta = {"versions": {str(i): {} for i in range(versions)}}
    if created_days_ago is not None:
        created = NOW - dt.timedelta(days=created_days_ago)
        meta["time"] = {"created": created.isoformat().replace("+00:00", "Z")}
    if repo:
        meta["repository"] = {"type": "git", "url": "https://github.com/x/y"}
    return meta


class SpecifierGate(unittest.TestCase):
    def test_registry_ranges_are_checked(self):
        for spec in ["^1.2.3", "~4.0.0", "1.2.3", "*", "latest", ">=2 <3"]:
            self.assertTrue(c.is_registry_specifier(spec), spec)

    def test_local_and_url_specifiers_are_skipped(self):
        # hops' two local eslint plugins are `link:` — the first false positive
        # this check would have produced, 2 of 111 dependencies.
        for spec in ["link:eslint-rules/eslint-plugin-no-string-date",
                     "file:../shared", "workspace:*", "catalog:react",
                     "npm:@scope/other@1", "git+https://github.com/a/b.git",
                     "github:a/b", "owner/repo"]:
            self.assertFalse(c.is_registry_specifier(spec), spec)


class Existence(unittest.TestCase):
    def test_missing_package_blocks(self):
        found = c.evaluate("totally-made-up-lib", None, set(), NOW)
        self.assertEqual([f.rule for f in found], ["does-not-exist"])
        self.assertTrue(found[0].blocking)


class Age(unittest.TestCase):
    def test_recently_registered_needs_review(self):
        found = c.evaluate("brand-new-thing", pkg(created_days_ago=3, versions=1), set(), NOW)
        self.assertIn("recently-registered", [f.rule for f in found])

    def test_mature_package_is_clean(self):
        # matches the real distribution: hops' youngest direct dependency is 298 days old
        self.assertEqual(c.evaluate("react", pkg(created_days_ago=2227, versions=40), set(), NOW), [])

    def test_single_version_but_young_needs_review(self):
        found = c.evaluate("one-shot", pkg(created_days_ago=200, versions=1), set(), NOW)
        self.assertIn("single-version", [f.rule for f in found])

    def test_single_version_and_old_is_accepted(self):
        # a stable tiny utility published once years ago is normal
        self.assertEqual(c.evaluate("ancient", pkg(created_days_ago=1500, versions=1), set(), NOW), [])


class NearNeighbour(unittest.TestCase):
    def test_typo_of_an_existing_dependency_is_flagged(self):
        found = c.evaluate("react-router-dm", pkg(created_days_ago=900, versions=20),
                           {"react-router-dom"}, NOW)
        self.assertIn("near-neighbour", [f.rule for f in found])

    def test_short_names_are_not_compared(self):
        # measured: without this floor, clsx<->tsx and vite<->vitest both fire
        # on hops' existing manifest. Documented limitation: clsx -> clsxx is missed.
        found = c.evaluate("clsxx", pkg(created_days_ago=900, versions=9), {"clsx"}, NOW)
        self.assertNotIn("near-neighbour", [f.rule for f in found])

    def test_unrelated_names_are_not_flagged(self):
        found = c.evaluate("tailwind-merge", pkg(created_days_ago=900, versions=20),
                           {"react-router-dom", "@tanstack/react-query"}, NOW)
        self.assertEqual(found, [])


class Provenance(unittest.TestCase):
    def test_missing_repository_is_advisory_only(self):
        found = c.evaluate("no-repo-lib", pkg(created_days_ago=900, versions=12, repo=False),
                           set(), NOW)
        self.assertEqual([f.rule for f in found], ["no-repository"])
        self.assertEqual(found[0].severity, "info")
        self.assertFalse(found[0].blocking)


class DiffScope(unittest.TestCase):
    def test_only_added_dependencies_are_considered(self):
        before = {"dependencies": {"react": "^18", "lodash": "^4"}}
        after = {"dependencies": {"react": "^19", "lodash": "^4", "new-thing": "^1"}}
        added = {n: s for n, s in c.deps_of(after).items() if n not in c.deps_of(before)}
        # react changed version but is not newly added — out of scope by design
        self.assertEqual(set(added), {"new-thing"})

    def test_all_dependency_fields_are_read(self):
        m = {"dependencies": {"a": "1"}, "devDependencies": {"b": "1"},
             "optionalDependencies": {"c": "1"}, "peerDependencies": {"d": "1"}}
        self.assertEqual(set(c.deps_of(m)), {"a", "b", "c", "d"})


class EndToEnd(unittest.TestCase):
    def _run(self, before, after, allowlist=None, stub=None):
        with tempfile.TemporaryDirectory() as d:
            bp, ap = Path(d) / "before.json", Path(d) / "after.json"
            bp.write_text(json.dumps(before)); ap.write_text(json.dumps(after))
            argv = ["--before", str(bp), "--after", str(ap)]
            if allowlist is not None:
                lp = Path(d) / "allow.json"; lp.write_text(json.dumps(allowlist))
                argv += ["--allowlist", str(lp)]
            original = c.NpmRegistry.metadata
            c.NpmRegistry.metadata = lambda self, name: (stub or {}).get(name)
            try:
                return c.main(argv)
            finally:
                c.NpmRegistry.metadata = original

    def test_hallucinated_package_fails_the_build(self):
        rc = self._run({"dependencies": {}}, {"dependencies": {"quantum-hyperloop-utils": "^1"}},
                       stub={})
        self.assertEqual(rc, 1)

    def test_local_plugin_addition_passes(self):
        rc = self._run({"devDependencies": {}},
                       {"devDependencies": {"eslint-plugin-no-string-date":
                                            "link:eslint-rules/eslint-plugin-no-string-date"}})
        self.assertEqual(rc, 0)

    def test_allowlist_suppresses_a_known_new_package(self):
        rc = self._run({"dependencies": {}}, {"dependencies": {"freshly-published": "^1"}},
                       allowlist={"allow": [{"package": "freshly-published",
                                             "reason": "vendor SDK, confirmed with the vendor 2026-08-19"}]},
                       stub={"freshly-published": pkg(created_days_ago=2, versions=1)})
        self.assertEqual(rc, 0)

    def test_advisory_mode_never_fails(self):
        with tempfile.TemporaryDirectory() as d:
            bp, ap = Path(d) / "b.json", Path(d) / "a.json"
            bp.write_text(json.dumps({"dependencies": {}}))
            ap.write_text(json.dumps({"dependencies": {"made-up": "^1"}}))
            original = c.NpmRegistry.metadata
            c.NpmRegistry.metadata = lambda self, name: None
            try:
                self.assertEqual(c.main(["--before", str(bp), "--after", str(ap), "--advisory"]), 0)
            finally:
                c.NpmRegistry.metadata = original




class RegistryOutage(unittest.TestCase):
    """An unreachable registry must not be confused with a missing package."""

    def _run_with(self, raiser):
        with tempfile.TemporaryDirectory() as d:
            b, a = Path(d) / "b.json", Path(d) / "a.json"
            b.write_text(json.dumps({"dependencies": {}}))
            a.write_text(json.dumps({"dependencies": {"some-new-lib": "^1"}}))
            original = c.NpmRegistry.metadata
            c.NpmRegistry.metadata = raiser
            try:
                return c.main(["--before", str(b), "--after", str(a)])
            finally:
                c.NpmRegistry.metadata = original

    def test_outage_fails_open_instead_of_crashing(self):
        def unreachable(self, name):
            raise c.Unreachable("simulated outage")
        self.assertEqual(self._run_with(unreachable), 0)

    def test_outage_is_not_reported_as_a_missing_package(self):
        # the failure mode that would block every dependency-adding PR
        def unreachable(self, name):
            raise c.Unreachable("simulated outage")
        self.assertNotEqual(self._run_with(unreachable), 1)

    def test_real_404_still_blocks_during_partial_availability(self):
        def missing(self, name):
            return None
        self.assertEqual(self._run_with(missing), 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
