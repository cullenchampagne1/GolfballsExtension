"""Project API validation for aggregate-only extension telemetry."""

import ast
import importlib.util
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from pydantic import ValidationError


ROOT = Path(__file__).resolve().parents[1]
CLIENT_API = ROOT / ".revstack" / "logic" / "client_api.py"


@unittest.skipUnless(CLIENT_API.exists(), "local project runtime is not available")
class UsageTelemetryContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("golfballs_client_api_usage", CLIENT_API)
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
        cls.UsageEvent = module.UsageEvent

        routes_tree = ast.parse((ROOT / ".revstack" / "routes.py").read_text())
        names = {
            "_USAGE_FEATURE_LABELS", "_USAGE_SOURCE_LABELS",
            "_USAGE_TRANSPORT_LABELS", "_USAGE_COLORS",
            "_usage_days", "_utilization_series", "_core_tool_rows",
            "_console_usage_utilization",
            "_console_usage_utilization_table",
        }
        selected = []
        for node in routes_tree.body:
            if isinstance(node, ast.FunctionDef) and node.name in names:
                selected.append(node)
            elif isinstance(node, ast.Assign) and any(
                isinstance(target, ast.Name) and target.id in names
                for target in node.targets
            ):
                selected.append(node)
        cls.routes = {
            "datetime": datetime, "timedelta": timedelta, "timezone": timezone,
        }
        exec(compile(ast.Module(body=selected, type_ignores=[]), "usage-routes", "exec"), cls.routes)

    def test_accepts_a_registered_coalesced_email_aggregate(self):
        event = self.UsageEvent.model_validate({
            "kind": "feature", "feature": "email_send", "source": "task_list",
            "transport": "pa", "count": 4, "word_count": 381,
            "attachment_count": 2, "inline_image_count": 1,
        })
        self.assertEqual(event.count, 4)
        self.assertEqual(event.word_count, 381)

    def test_accepts_a_coalesced_contact_import_run_counter(self):
        event = self.UsageEvent.model_validate({
            "kind": "feature", "feature": "contact_import_run",
            "source": "crm_search", "count": 2,
        })
        self.assertEqual(event.count, 2)

    def test_rejects_content_and_unregistered_dimensions(self):
        for patch in (
            {"subject": "private subject"},
            {"recipient": "someone@example.com"},
            {"feature": "made_up_feature"},
            {"source": "account-123"},
        ):
            payload = {
                "kind": "feature", "feature": "email_send", "source": "popup",
                "transport": "mailto", **patch,
            }
            with self.assertRaises(ValidationError):
                self.UsageEvent.model_validate(payload)

    def test_rejects_impossible_or_mixed_feature_rows(self):
        for payload in (
            {"kind": "feature", "feature": "email_send", "source": "popup"},
            {"kind": "feature", "feature": "proof_submit", "source": "submit_proof", "transport": "pa"},
            {"kind": "feature", "feature": "email_send", "source": "popup", "transport": "pa", "count": 1, "attachment_count": 2},
            {"kind": "surface_open", "surface": "task_list", "word_count": 20},
        ):
            with self.assertRaises(ValidationError):
                self.UsageEvent.model_validate(payload)

    def test_manager_views_group_daily_email_sources_and_delivery_methods(self):
        day = datetime.utcnow().date().isoformat()
        rows = [
            {"day": day, "feature": "email_send", "source": "task_list", "transport": "pa", "uses": 2, "words": 40, "attachments": 1, "inline_images": 1},
            {"day": day, "feature": "email_send", "source": "popup", "transport": "mailto", "uses": 1, "words": 12, "attachments": 0, "inline_images": 0},
            {"day": day, "feature": "proof_submit", "source": "submit_proof", "transport": "none", "uses": 3, "words": 0, "attachments": 0, "inline_images": 0},
            {"day": day, "feature": "gift_catalog_add", "source": "gift_catalog", "transport": "none", "uses": 4, "words": 0, "attachments": 0, "inline_images": 0},
        ]
        self.routes["_usage_feature_rows"] = lambda _days: rows
        payload = self.routes["_console_usage_utilization"](30)
        views = {view["id"]: view for view in payload["views"]}

        self.assertEqual(set(views), {
            "email_sends", "email_transport", "email_words", "email_attachments",
            "email_inline", "core_tools", "catalog",
        })
        sends = {series["id"]: series for series in views["email_sends"]["series"]}
        self.assertEqual(sends["task_list"]["values"][-1], 2)
        self.assertEqual(sends["popup"]["values"][-1], 1)
        transports = {series["id"]: series["total"] for series in views["email_transport"]["series"]}
        self.assertEqual(transports, {"pa": 2, "mailto": 1})
        self.assertEqual(views["email_words"]["total"], 52)
        self.assertEqual(views["catalog"]["total"], 4)

        table = self.routes["_console_usage_utilization_table"](30)
        self.assertEqual(table["summary"], "10 actions · 30d")
        self.assertTrue(any(row["feature"]["text"] == "Proofs submitted" for row in table["rows"]))

    def test_empty_manager_query_stays_empty_until_real_events_arrive(self):
        self.routes["_usage_feature_rows"] = lambda _days: []
        payload = self.routes["_console_usage_utilization"](30)
        views = {view["id"]: view for view in payload["views"]}

        self.assertNotIn("sample", payload)
        self.assertEqual(payload["summary"], "0 tracked actions · 30d")
        self.assertTrue(all(view["series"] == [] for view in views.values()))
        self.assertTrue(all(view["total"] == 0 for view in views.values()))

        table = self.routes["_console_usage_utilization_table"](30)
        self.assertNotIn("sample", table)
        self.assertEqual(table["summary"], "0 actions · 30d")
        self.assertEqual(table["rows"], [])
        self.assertEqual(
            len({column["key"] for column in table["columns"]}),
            len(table["columns"]),
        )

    def test_core_tools_counts_import_runs_instead_of_imported_records(self):
        day = datetime.utcnow().date().isoformat()
        self.routes["_usage_feature_rows"] = lambda _days: [
            {
                "day": day, "feature": "contact_import", "source": "crm_search",
                "transport": "none", "events": 1, "uses": 2_000,
                "words": 0, "attachments": 0, "inline_images": 0,
            },
            {
                "day": day, "feature": "contact_import_run", "source": "crm_search",
                "transport": "none", "events": 1, "uses": 1,
                "words": 0, "attachments": 0, "inline_images": 0,
            },
            {
                "day": day, "feature": "proof_submit", "source": "submit_proof",
                "transport": "none", "events": 1, "uses": 4,
                "words": 0, "attachments": 0, "inline_images": 0,
            },
        ]

        payload = self.routes["_console_usage_utilization"](30)
        core = next(view for view in payload["views"] if view["id"] == "core_tools")
        series = {item["id"]: item for item in core["series"]}

        self.assertEqual(series["contact_import_run"]["label"], "Import runs")
        self.assertEqual(series["contact_import_run"]["values"][-1], 1)
        self.assertEqual(series["contact_import_run"]["total"], 1)
        self.assertEqual(series["proof_submit"]["values"][-1], 4)
        self.assertEqual(core["total"], 5)

        details = self.routes["_console_usage_utilization_table"](30)
        imported = next(row for row in details["rows"] if row["id"].startswith("contact_import:"))
        self.assertEqual(imported["uses"]["text"], "2,000")
        self.assertFalse(any(row["id"].startswith("contact_import_run:") for row in details["rows"]))

    def test_core_tools_uses_legacy_import_samples_only_without_exact_runs(self):
        day = datetime.utcnow().date().isoformat()
        legacy = {
            "day": day, "feature": "contact_import", "source": "crm_search",
            "transport": "none", "events": 2, "uses": 5_000,
            "words": 0, "attachments": 0, "inline_images": 0,
        }
        self.routes["_usage_feature_rows"] = lambda _days: [legacy]
        core = next(
            view for view in self.routes["_console_usage_utilization"](30)["views"]
            if view["id"] == "core_tools"
        )
        self.assertEqual(core["series"][0]["values"][-1], 2)

        exact = {**legacy, "feature": "contact_import_run", "events": 1, "uses": 3}
        self.routes["_usage_feature_rows"] = lambda _days: [legacy, exact]
        core = next(
            view for view in self.routes["_console_usage_utilization"](30)["views"]
            if view["id"] == "core_tools"
        )
        self.assertEqual(core["series"][0]["values"][-1], 3)

    def test_catalog_usage_is_the_default_when_email_data_is_missing(self):
        day = datetime.utcnow().date().isoformat()
        self.routes["_usage_feature_rows"] = lambda _days: [{
            "day": day,
            "feature": "gift_catalog_search",
            "source": "gift_catalog",
            "transport": "none",
            "uses": 6,
            "words": 0,
            "attachments": 0,
            "inline_images": 0,
        }]

        payload = self.routes["_console_usage_utilization"](30)
        views = {view["id"]: view for view in payload["views"]}

        self.assertEqual(payload["default"], "catalog")
        self.assertEqual(views["email_sends"]["series"], [])
        self.assertEqual(views["catalog"]["total"], 6)


@unittest.skipUnless(CLIENT_API.exists(), "local project runtime is not available")
class ExtensionAnalyticsContractTests(unittest.TestCase):
    """Pure-logic slices of the Extension Analytics endpoints (routes.py) that
    don't need a live database: the presence-bucket math (shared by the
    Presence card and the new Concurrency chart) and the static Backlog
    content (curated from the metrics catalog, not a telemetry aggregate)."""

    @classmethod
    def setUpClass(cls):
        routes_tree = ast.parse((ROOT / ".revstack" / "routes.py").read_text())
        names = {
            "_presence_hourly_buckets",
            "_CATALOG_FUNNEL", "_WORKFLOW_STAGES",
        }
        selected = []
        for node in routes_tree.body:
            if isinstance(node, ast.FunctionDef) and node.name in names:
                selected.append(node)
            elif isinstance(node, ast.Assign) and any(
                isinstance(target, ast.Name) and target.id in names
                for target in node.targets
            ):
                selected.append(node)
        cls.routes = {"datetime": datetime, "timedelta": timedelta, "timezone": timezone}
        exec(compile(ast.Module(body=selected, type_ignores=[]), "analytics-routes", "exec"), cls.routes)

    def test_presence_buckets_count_only_sessions_alive_in_each_hour(self):
        day_floor = datetime(2026, 9, 1, 0, 0, 0)

        class FakeSession:
            def __init__(self, started_at, last_seen_at):
                self.started_at = started_at
                self.last_seen_at = last_seen_at

        sessions = [
            # alive 00:30-02:15 -> counts in hours 0, 1, 2
            FakeSession(day_floor + timedelta(minutes=30), day_floor + timedelta(hours=2, minutes=15)),
            # alive only within hour 5
            FakeSession(day_floor + timedelta(hours=5, minutes=10), day_floor + timedelta(hours=5, minutes=40)),
        ]
        buckets = self.routes["_presence_hourly_buckets"](sessions, day_floor)
        self.assertEqual(len(buckets), 24)
        self.assertEqual(buckets[0], 1)
        self.assertEqual(buckets[1], 1)
        self.assertEqual(buckets[2], 1)
        self.assertEqual(buckets[3], 0)
        self.assertEqual(buckets[5], 1)
        self.assertEqual(sum(buckets), 4)

    def test_nothing_here_serves_a_hardcoded_backlog_any_more(self):
        """`backlog` was a card whose content was a list of GAPS.

        Not a telemetry aggregate at all: a hardcoded transcription of
        `uploads/analytics-metrics-catalog.md` §7, ranked by value over cost. A
        card that lists what the console cannot show yet is a document, and it
        belongs in the document it was copied from.
        """
        self.assertNotIn("_console_backlog", self.routes)
        self.assertNotIn("_BACKLOG_ITEMS", self.routes)
        source = (ROOT / ".revstack" / "routes.py").read_text()
        self.assertNotIn('endpoint == "backlog"', source)

    def test_catalog_funnel_stages_are_the_seven_tracked_gift_catalog_features(self):
        features = [feature for feature, _label in self.routes["_CATALOG_FUNNEL"]]
        self.assertEqual(len(features), 7)
        self.assertTrue(all(feature.startswith("gift_catalog_") for feature in features))
        self.assertEqual(features[0], "gift_catalog_open")
        self.assertEqual(features[-1], "gift_catalog_checkout")

    def test_workflow_stages_are_a_strict_subset_of_the_catalog_funnel(self):
        # WORKFLOW re-labels a subset of the same funnel features — this pins
        # that they stay a subset, so the two lists can't silently diverge
        # (e.g. a renamed feature id breaking one list but not the other).
        funnel_features = {feature for feature, _label in self.routes["_CATALOG_FUNNEL"]}
        workflow_features = [feature for feature, _label in self.routes["_WORKFLOW_STAGES"]]
        self.assertTrue(set(workflow_features).issubset(funnel_features))
        self.assertEqual(workflow_features[-1], "gift_catalog_checkout")


if __name__ == "__main__":
    unittest.main()
