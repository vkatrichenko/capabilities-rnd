"""Self-tests for check_scorecard. Fully offline — no Scorecard run, no network.

Run: python3 -m unittest discover -s . -p 'test_check_scorecard.py'

Mirrors check-scorecard.test.mjs case for case. The fail-closed cases (missing
check, missing baseline entry, -1 inconclusive) are the point of this file: a
comparison tool that treats "absent" as "fine" reports clean exactly when the
measurement broke.
"""

import json
import os
import tempfile
import unittest

import check_scorecard as sc

ALL_CHECKS = sc.TRACKED + list(sc.IGNORED)


def _check(name, scores):
    return {"name": name, "score": scores.get(name, 10), "reason": f"reason for {name}"}


def results(scores=None, version="v5.5.0", commit="abc123def456"):
    """A full Scorecard result with every check at 10, overridden by `scores`."""
    scores = scores or {}
    return {
        "date": "2026-08-23",
        "repo": {"name": "github.com/x/y", "commit": commit},
        "scorecard": {"version": version},
        "score": 5.4,
        "checks": [_check(n, scores) for n in ALL_CHECKS],
    }


def baseline(scores=None, version="v5.5.0"):
    scores = scores or {}
    return {
        "scorecard_version": version,
        "measured": {
            "date": "2026-08-18",
            "repo": "github.com/x/y",
            "commit": "f640dee9f",
            "aggregate": 5.4,
        },
        "checks": {n: scores.get(n, 10) for n in sc.TRACKED},
    }


def tmp_file(obj):
    fd, path = tempfile.mkstemp(suffix=".json")
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        handle.write(obj if isinstance(obj, str) else json.dumps(obj))
    return path


def run(argv):
    """main() with output captured, so a failing assert prints something readable."""
    out = []
    code = sc.main(argv, log=out.append, err=out.append)
    return code, "\n".join(str(line) for line in out)


class Policy(unittest.TestCase):
    def test_every_check_classified_exactly_once(self):
        seen = sc.GATED + sc.REPORTED + list(sc.IGNORED)
        self.assertEqual(len(set(seen)), len(seen), "a check appears in two policy lists")
        # 18 is Scorecard v5's full set. If upstream adds one, this fails and
        # someone has to decide gated/reported/ignored rather than silently
        # dropping it.
        self.assertEqual(len(seen), 18)

    def test_rolling_window_checks_are_reported_not_gated(self):
        """Code-Review and CI-Tests score recent changesets, not this commit.

        Gating them fails one pull request because other people merged
        unreviewed that week — the reason this job is safe to run on a PR is
        that every gated check is fixable by the author of the change.
        """
        for name in ("Code-Review", "CI-Tests"):
            self.assertIn(name, sc.REPORTED)
            self.assertNotIn(name, sc.GATED)
        _, regressions, _ = sc.compare(
            results({"Code-Review": 0, "CI-Tests": 0}),
            baseline({"Code-Review": 10, "CI-Tests": 10}),
        )
        self.assertEqual(regressions, [])

    def test_policy_matches_the_node_implementation(self):
        """The two twins must not drift apart in what they gate.

        Only runs where both live side by side (the tooling repo). A repo that
        ships the Python twin alone has no .mjs to compare against.
        """
        here = os.path.dirname(os.path.abspath(__file__))
        mjs_path = os.path.join(here, "check-scorecard.mjs")
        if not os.path.exists(mjs_path):
            self.skipTest("Node twin not present in this repo")
        with open(mjs_path, encoding="utf-8") as handle:
            mjs = handle.read()
        gated_block = mjs.split("export const REPORTED")[0]
        reported_block = mjs.split("export const REPORTED")[1].split("export const IGNORED")[0]
        for name in sc.GATED:
            self.assertIn(f"'{name}'", gated_block)
        for name in sc.REPORTED:
            self.assertIn(f"'{name}'", reported_block)


class Compare(unittest.TestCase):
    def test_no_movement_is_not_a_regression(self):
        rows, regressions, notes = sc.compare(results(), baseline())
        self.assertEqual(regressions, [])
        self.assertEqual(notes, [])

    def test_gated_drop_is_a_regression_and_is_named(self):
        _, regressions, _ = sc.compare(
            results({"Pinned-Dependencies": 3}), baseline({"Pinned-Dependencies": 5})
        )
        self.assertEqual(len(regressions), 1)
        self.assertEqual(regressions[0]["name"], "Pinned-Dependencies")
        self.assertEqual(regressions[0]["status"], "REGRESSED")

    def test_reported_drop_is_shown_but_does_not_fail(self):
        rows, regressions, _ = sc.compare(
            results({"Vulnerabilities": 0}), baseline({"Vulnerabilities": 8})
        )
        self.assertEqual(regressions, [])
        row = next(r for r in rows if r["name"] == "Vulnerabilities")
        self.assertEqual(row["status"], "REGRESSED")

    def test_a_rise_is_improved_and_never_auto_ratchets(self):
        rows, regressions, _ = sc.compare(
            results({"Token-Permissions": 9}), baseline({"Token-Permissions": 0})
        )
        self.assertEqual(regressions, [])
        row = next(r for r in rows if r["name"] == "Token-Permissions")
        self.assertEqual(row["status"], "improved")
        self.assertEqual(
            row["before"], 0, "baseline must be left alone — raising it is a reviewed commit"
        )

    def test_ignored_check_dropping_is_silent(self):
        rows, regressions, _ = sc.compare(results({"SAST": 0, "License": 0}), baseline())
        self.assertEqual(regressions, [])
        self.assertEqual(next(r for r in rows if r["name"] == "SAST")["status"], "not tracked")


class FailsClosed(unittest.TestCase):
    def test_gated_check_missing_from_results_fails(self):
        res = results()
        res["checks"] = [c for c in res["checks"] if c["name"] != "Dangerous-Workflow"]
        _, regressions, _ = sc.compare(res, baseline())
        self.assertEqual(len(regressions), 1)
        self.assertEqual(regressions[0]["status"], "missing from results")

    def test_reported_check_missing_from_results_does_not_fail(self):
        res = results()
        res["checks"] = [c for c in res["checks"] if c["name"] != "Branch-Protection"]
        _, regressions, _ = sc.compare(res, baseline())
        self.assertEqual(regressions, [])

    def test_gated_check_missing_from_baseline_fails(self):
        base = baseline()
        del base["checks"]["Dangerous-Workflow"]
        _, regressions, _ = sc.compare(results(), base)
        self.assertEqual(len(regressions), 1)
        self.assertEqual(regressions[0]["status"], "missing from baseline")

    def test_gated_check_going_inconclusive_fails(self):
        _, regressions, _ = sc.compare(
            results({"Binary-Artifacts": -1}), baseline({"Binary-Artifacts": 9})
        )
        self.assertEqual(len(regressions), 1)
        self.assertEqual(regressions[0]["status"], "inconclusive (-1)")

    def test_check_already_inconclusive_in_baseline_stays_quiet(self):
        _, regressions, _ = sc.compare(
            results({"Token-Permissions": -1}), baseline({"Token-Permissions": -1})
        )
        self.assertEqual(regressions, [])


class VersionDrift(unittest.TestCase):
    def test_version_change_is_a_note_not_a_failure(self):
        _, regressions, notes = sc.compare(results(version="v5.6.0"), baseline(version="v5.5.0"))
        self.assertEqual(regressions, [])
        self.assertEqual(len(notes), 1)
        self.assertIn("v5.5.0 -> v5.6.0", notes[0])


class Main(unittest.TestCase):
    def test_exit_1_on_gated_regression_and_names_the_check(self):
        code, out = run(
            [
                "--results",
                tmp_file(results({"Binary-Artifacts": 4})),
                "--baseline",
                tmp_file(baseline({"Binary-Artifacts": 10})),
            ]
        )
        self.assertEqual(code, 1)
        self.assertIn("Gated regressions", out)
        self.assertIn("Binary-Artifacts**: 10 -> 4", out)

    def test_exit_0_when_nothing_regressed(self):
        code, out = run(["--results", tmp_file(results()), "--baseline", tmp_file(baseline())])
        self.assertEqual(code, 0)
        self.assertIn("No gated check regressed", out)

    def test_advisory_downgrades_to_0_but_still_prints(self):
        code, out = run(
            [
                "--results",
                tmp_file(results({"Dangerous-Workflow": 1})),
                "--baseline",
                tmp_file(baseline({"Dangerous-Workflow": 10})),
                "--advisory",
            ]
        )
        self.assertEqual(code, 0)
        self.assertIn("Gated regressions", out)

    def test_exit_2_on_malformed_json(self):
        code, out = run(["--results", tmp_file("{not json"), "--baseline", tmp_file(baseline())])
        self.assertEqual(code, 2)
        self.assertIn("cannot parse", out)

    def test_exit_2_when_results_is_not_a_scorecard_result(self):
        code, out = run(
            ["--results", tmp_file({"hello": "world"}), "--baseline", tmp_file(baseline())]
        )
        self.assertEqual(code, 2)
        self.assertIn("no `checks` array", out)

    def test_exit_2_on_missing_file(self):
        code, out = run(["--results", "/nope/missing.json", "--baseline", "/nope/b.json"])
        self.assertEqual(code, 2)
        self.assertIn("cannot read", out)

    def test_exit_2_with_no_arguments(self):
        self.assertEqual(run([])[0], 2)

    def test_summary_writes_the_same_markdown_it_printed(self):
        summary = os.path.join(tempfile.mkdtemp(), "summary.md")
        code, out = run(
            [
                "--results",
                tmp_file(results()),
                "--baseline",
                tmp_file(baseline()),
                "--summary",
                summary,
            ]
        )
        self.assertEqual(code, 0)
        with open(summary, encoding="utf-8") as handle:
            self.assertEqual(handle.read(), out)

    def test_write_baseline_round_trips(self):
        path = os.path.join(tempfile.mkdtemp(), "baseline.json")
        res = results({"Pinned-Dependencies": 0, "Vulnerabilities": 0})
        self.assertEqual(run(["--results", tmp_file(res), "--write-baseline", path])[0], 0)

        with open(path, encoding="utf-8") as handle:
            written = json.load(handle)
        self.assertEqual(written["scorecard_version"], "v5.5.0")
        self.assertEqual(written["measured"]["commit"], "abc123def456")
        self.assertEqual(sorted(written["checks"]), sorted(sc.TRACKED))
        self.assertEqual(written["checks"]["Pinned-Dependencies"], 0)
        self.assertNotIn("SAST", written["checks"], "ignored checks must not enter the baseline")

        self.assertEqual(sc.compare(res, written)[1], [])


class BaselineFrom(unittest.TestCase):
    def test_omits_tracked_checks_the_run_did_not_produce(self):
        res = results()
        res["checks"] = [c for c in res["checks"] if c["name"] != "Packaging"]
        self.assertNotIn("Packaging", sc.baseline_from(res)["checks"])


if __name__ == "__main__":
    unittest.main()
