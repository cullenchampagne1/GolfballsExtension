"""Integration coverage for the Extension Analytics endpoints (routes.py).

Unlike `test_usage_telemetry_contract.py`'s pure-logic slices, these tests run
the real per-rep/adoption/identity SQL aggregations against an in-memory
SQLite database seeded with a few distinguishable installs — the SQL grouping
itself (GROUP BY owner_credential_id, day-bucketing, ratio math) is where a
real bug would hide, and no pure-function test can catch a wrong column name
or an off-by-one bucket boundary. Mirror models follow the same local-model
convention as `test_product_generation.py` (own lightweight declarative
models bound to the same table names) rather than importing revstack-backend
directly, so this test has no cross-repo import dependency.
"""

import ast
import math
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from sqlalchemy import Boolean, Column, DateTime, Integer, String, create_engine, func, inspect, select
from sqlalchemy.orm import DeclarativeBase, Session

ROOT = Path(__file__).resolve().parents[1]
ROUTES = ROOT / ".revstack" / "routes.py"


class Base(DeclarativeBase):
    pass


class ExtensionUsageSession(Base):
    __tablename__ = "extension_usage_sessions"
    id = Column(String(36), primary_key=True)
    owner_credential_id = Column(String(36), nullable=False, index=True)
    started_at = Column(DateTime, nullable=False)
    last_seen_at = Column(DateTime, nullable=False)
    surface = Column(String(64), nullable=True)
    ping_ms = Column(Integer, nullable=True)
    events = Column(Integer, nullable=False, default=0)
    dropped = Column(Integer, nullable=False, default=0)


class ExtensionUsageEvent(Base):
    __tablename__ = "extension_usage_events"
    id = Column(Integer, primary_key=True, autoincrement=True)
    owner_credential_id = Column(String(36), nullable=False, index=True)
    session_id = Column(String(36), nullable=False)
    kind = Column(String(16), nullable=False)
    surface = Column(String(64), nullable=True)
    surface_kind = Column(String(16), nullable=True)
    feature = Column(String(48), nullable=True)
    source = Column(String(32), nullable=True)
    transport = Column(String(16), nullable=True)
    count = Column(Integer, nullable=False, default=1)
    word_count = Column(Integer, nullable=False, default=0)
    attachment_count = Column(Integer, nullable=False, default=0)
    inline_image_count = Column(Integer, nullable=False, default=0)
    duration_ms = Column(Integer, nullable=True)
    ok = Column(Boolean, nullable=False, default=True)
    occurred_at = Column(DateTime, nullable=False)


class ExtensionInstallationIdentity(Base):
    __tablename__ = "extension_installation_identities"
    credential_id = Column(String(36), primary_key=True)
    display_name = Column(String(120), nullable=False)
    local_part = Column(String(64), nullable=True)


class AuthApiKey(Base):
    __tablename__ = "auth_api_keys"
    id = Column(String(36), primary_key=True)
    key_prefix = Column(String(32), nullable=True)


def _load_routes_functions(names, extra_globals=None):
    """AST-select just the named functions/assignments out of routes.py and
    exec them into an isolated namespace — the same technique
    `test_usage_telemetry_contract.py` already uses, so routes.py's dozens of
    RevStack-injected globals (APIRouter, Principal, project_dir, …) never
    need stubbing for logic that doesn't touch them."""
    tree = ast.parse(ROUTES.read_text())
    selected = []
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name in names:
            selected.append(node)
        elif isinstance(node, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id in names for target in node.targets
        ):
            selected.append(node)
    found = {
        node.name if isinstance(node, ast.FunctionDef) else node.targets[0].id
        for node in selected
    }
    missing = names - found
    assert not missing, f"routes.py no longer defines: {sorted(missing)}"
    namespace = dict(extra_globals or {})
    exec(compile(ast.Module(body=selected, type_ignores=[]), "extension-analytics-routes", "exec"), namespace)
    return namespace


class ExtensionAnalyticsIntegrationTests(unittest.TestCase):
    """Seeds three installs (one registered, two not) with distinguishable
    session/event patterns and exercises the real GROUP BY aggregations."""

    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(cls.engine)
        cls.now = datetime(2026, 9, 4, 12, 0, 0)
        with Session(cls.engine) as session:
            # Rep A: registered, high activity — 5 feature events/day for 3 days,
            # touches 2 surfaces, reaches 3 of the 7 catalog funnel stages.
            session.add(ExtensionInstallationIdentity(
                credential_id="cred-a", display_name="Alex Rep", local_part="alex"))
            session.add(ExtensionUsageSession(
                id="sess-a", owner_credential_id="cred-a",
                started_at=cls.now - timedelta(days=2), last_seen_at=cls.now - timedelta(days=2, hours=-3)))
            for day_offset in range(3):
                day = cls.now - timedelta(days=day_offset)
                for _ in range(5):
                    session.add(ExtensionUsageEvent(
                        owner_credential_id="cred-a", session_id="sess-a", kind="feature",
                        feature="gift_catalog_open", source="gift_catalog", transport="none",
                        ok=True, occurred_at=day))
                session.add(ExtensionUsageEvent(
                    owner_credential_id="cred-a", session_id="sess-a", kind="surface_open",
                    surface="Gifting Catalog", occurred_at=day))
            session.add(ExtensionUsageEvent(
                owner_credential_id="cred-a", session_id="sess-a", kind="surface_open",
                surface="CRM Search", occurred_at=cls.now))
            session.add(ExtensionUsageEvent(
                owner_credential_id="cred-a", session_id="sess-a", kind="feature",
                feature="gift_catalog_search", source="gift_catalog", transport="none",
                ok=True, occurred_at=cls.now))
            session.add(ExtensionUsageEvent(
                owner_credential_id="cred-a", session_id="sess-a", kind="feature",
                feature="gift_catalog_add", source="gift_catalog", transport="none",
                ok=True, occurred_at=cls.now))

            # Latency events (kind=latency) — the Response time percentile
            # trend's only source. Four samples on one day, deliberately
            # spread so p50 and p95/p99 cannot coincide.
            for duration in (100, 200, 900, 1500):
                session.add(ExtensionUsageEvent(
                    owner_credential_id="cred-a", session_id="sess-a", kind="latency",
                    duration_ms=duration, ok=True, occurred_at=cls.now))

            # Rep B: unregistered, low activity — 1 feature event, 1 surface.
            # Its session carries the dropped/total counters the Integrity
            # block's dropped-event rate divides (2 dropped of 8 = 25%).
            session.add(ExtensionUsageSession(
                id="sess-b", owner_credential_id="cred-b",
                started_at=cls.now - timedelta(hours=1), last_seen_at=cls.now,
                events=8, dropped=2))
            session.add(ExtensionUsageEvent(
                owner_credential_id="cred-b", session_id="sess-b", kind="feature",
                feature="email_send", source="popup", transport="pa", count=1,
                ok=True, occurred_at=cls.now))
            # …and one FAILED feature event, so the error rate has a numerator.
            session.add(ExtensionUsageEvent(
                owner_credential_id="cred-b", session_id="sess-b", kind="feature",
                feature="email_send", source="popup", transport="pa", count=1,
                ok=False, occurred_at=cls.now))
            session.add(ExtensionUsageEvent(
                owner_credential_id="cred-b", session_id="sess-b", kind="surface_open",
                surface="Toolbar Popup", occurred_at=cls.now))

            # Rep C: unregistered install with a session but zero feature usage
            # (an "idle rep" — must still surface at a finite, non-infinite rate).
            session.add(ExtensionUsageSession(
                id="sess-c", owner_credential_id="cred-c",
                started_at=cls.now - timedelta(days=1), last_seen_at=cls.now - timedelta(days=1, hours=-1)))

            session.add(AuthApiKey(id="cred-a", key_prefix="aaaa"))
            session.add(AuthApiKey(id="cred-b", key_prefix="bbbb"))
            session.add(AuthApiKey(id="cred-c", key_prefix="cccc"))
            session.commit()

        cls.routes = _load_routes_functions(
            {
                "_usage_ready", "_usage_feature_ready", "_usage_feature_rows",
                "_usage_days", "_installation_owners", "_owner_label", "_percentile", "_fmt_ms", "_fmt_span",
                "_presence_hourly_buckets", "_USAGE_COLORS", "_USAGE_FEATURE_LABELS", "_USAGE_SOURCE_LABELS",
                "_USAGE_TRANSPORT_LABELS", "_MOCK_SEED", "_REP_WINDOW_DAYS", "_rep_aggregates", "_ago",
                "_console_usage_leaderboard", "_console_usage_rep_scorecard", "_console_usage_identity",
                "_console_usage_adoption_trend", "_console_usage_top_surfaces_list",
                "_console_usage_activity_heatmap", "_HEATMAP_DAYS",
                "_console_reliability_trend", "_console_reliability_integrity",
                "_LATENCY_OUTLIER_MS", "_LEADERBOARD_SORTS", "_console_usage_concurrency",
                "_presence_hourly_buckets", "_console_usage_kpi_strip",
            },
            extra_globals={
                "math": math,
                "datetime": datetime, "timedelta": timedelta, "timezone": timezone, "func": func, "inspect": inspect,
                "select": select, "Session": Session, "Optional": Optional,
                "auth_manager": type("Auth", (), {"engine": cls.engine})(),
                "ExtensionUsageSession": ExtensionUsageSession, "ExtensionUsageEvent": ExtensionUsageEvent,
                "ExtensionInstallationIdentity": ExtensionInstallationIdentity, "AuthApiKey": AuthApiKey,
                "_USAGE_LIVE_MINUTES": 5,
            },
        )

    def test_identity_donut_splits_registered_from_unregistered_installs(self):
        payload = self.routes["_console_usage_identity"]()
        segments = {segment["name"]: segment["value"] for segment in payload["segments"]}
        self.assertEqual(segments["Registered"], 1)   # cred-a only
        self.assertEqual(segments["Unregistered"], 2)  # cred-b, cred-c

    def test_leaderboard_ranks_the_busier_rep_first_and_names_it_by_identity(self):
        payload = self.routes["_console_usage_leaderboard"]()
        rows = payload["rows"]
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[0]["_select"], "cred-a")
        # Zero-padded so the rank column is a fixed-width rail past ten.
        self.assertEqual(rows[0]["rank"], {"kind": "mono", "text": "01"})
        self.assertEqual(rows[0]["rep"]["text"], "Alex Rep")
        self.assertEqual(rows[0]["rep"]["face"], "sans")
        # cred-c did nothing but hold a session open — must still show a
        # finite rate, never a crash from a divide-by-zero denominator.
        idle_row = next(row for row in rows if row["_select"] == "cred-c")
        self.assertEqual(idle_row["actions"]["text"], "0.0")

    def test_leaderboard_rep_cell_qualifies_the_name_with_its_install(self):
        # A display name alone can't be acted on — two reps can share one, and
        # an unregistered install has none at all. The sub line is what makes
        # the row identify a specific installation.
        rows = {row["_select"]: row for row in self.routes["_console_usage_leaderboard"]()["rows"]}
        registered = rows["cred-a"]["rep"]
        self.assertTrue(registered["sub"].startswith("rsk_aaaa_… · "))
        self.assertTrue(registered["sub"].endswith(" · 1 session"))
        self.assertIsNone(registered["tone"])
        # An unregistered install reads as a quieter name, never as a person.
        self.assertEqual(rows["cred-c"]["rep"]["tone"], "muted")

    def test_leaderboard_measures_breadth_against_the_orgs_own_tool_catalog(self):
        # "2/19" hard-coded next to the UI goes stale the day a surface ships;
        # the denominator is how many distinct tools anyone actually opened.
        rows = {row["_select"]: row for row in self.routes["_console_usage_leaderboard"]()["rows"]}
        # Gifting Catalog + CRM Search + Toolbar Popup across the whole org.
        self.assertEqual(rows["cred-a"]["tools"]["text"], "2/3")
        self.assertEqual(rows["cred-c"]["tools"]["text"], "0/3")

    def test_leaderboard_deviation_cell_is_signed_around_the_team_median(self):
        # A 0→1 fill can't say "behind the team" — the median has to be the
        # ZERO of this column, with the sign carrying the direction.
        rows = {row["_select"]: row for row in self.routes["_console_usage_leaderboard"]()["rows"]}
        self.assertEqual(rows["cred-a"]["dev"]["kind"], "diverge")
        self.assertGreater(rows["cred-a"]["dev"]["value"], 0)   # busiest rep
        self.assertLess(rows["cred-c"]["dev"]["value"], 0)      # idle install
        for row in rows.values():
            self.assertGreaterEqual(row["dev"]["value"], -1.0)
            self.assertLessEqual(row["dev"]["value"], 1.0)

    def test_leaderboard_footer_states_the_baseline_the_bars_are_drawn_against(self):
        payload = self.routes["_console_usage_leaderboard"]()
        rates = sorted(entry["actions_per_hour"] for entry in self.routes["_rep_aggregates"]()["reps"].values())
        median = rates[len(rates) // 2]
        self.assertEqual(payload["footer"]["note"], f"3 reps · median {median:.1f} act/hr")
        self.assertIn("scorecard", payload["footer"]["hint"])
        # `summary` would draw a second rail above the column labels restating
        # what the sort pills and the row count already say.
        self.assertNotIn("summary", payload)

    def test_leaderboard_row_click_selection_feeds_the_scorecard(self):
        leaderboard_top = self.routes["_console_usage_leaderboard"]()["rows"][0]["_select"]
        scorecard = self.routes["_console_usage_rep_scorecard"](leaderboard_top)
        self.assertEqual(scorecard["name"], "Alex Rep")
        self.assertEqual(scorecard["funnel"]["percent"], round(3 / 7 * 100))  # 3 of 7 catalog stages
        # Falling back to the top rep when nothing is selected must agree with
        # the leaderboard's own #1 row, not silently pick a different rep.
        default_scorecard = self.routes["_console_usage_rep_scorecard"](None)
        self.assertEqual(default_scorecard["name"], "Alex Rep")

    def test_scorecard_stats_never_repeat_the_number_the_ring_already_shows(self):
        # The ring IS the funnel; a tile repeating it spends a quarter of the
        # grid saying the same thing twice. These four answer what it can't.
        scorecard = self.routes["_console_usage_rep_scorecard"]("cred-a")
        stats = {stat["label"]: stat["value"] for stat in scorecard["stats"]}
        self.assertEqual(list(stats), ["Active hours", "Actions / hr", "Tools touched", "Time to 1st action"])
        self.assertEqual(stats["Tools touched"], "2/3")
        # sess-a's first feature event lands on its own start instant.
        self.assertEqual(stats["Time to 1st action"], "0m")
        self.assertEqual(stats["Active hours"], "3.0h")

    def test_scorecard_reports_no_first_action_rather_than_a_plausible_zero(self):
        # cred-c held a session open and did nothing. "0m" would read as the
        # fastest rep on the team; the truth is there is no sample.
        stats = {stat["label"]: stat["value"]
                 for stat in self.routes["_console_usage_rep_scorecard"]("cred-c")["stats"]}
        self.assertEqual(stats["Time to 1st action"], "—")

    def test_scorecard_funnel_ring_severity_tracks_the_designs_thresholds(self):
        # 3 of 7 stages = 43% — at or above the design's 40% "healthy" mark, so
        # the ring reads as normal rather than as a warning.
        self.assertEqual(self.routes["_console_usage_rep_scorecard"]("cred-a")["funnel"]["severity"], "normal")
        # cred-c reached no stage at all.
        self.assertEqual(self.routes["_console_usage_rep_scorecard"]("cred-c")["funnel"]["severity"], "warning")

    def test_scorecard_dwell_bars_diverge_around_the_team_median(self):
        # Every dwell bar is normalised against the LARGEST deviation in this
        # rep's own set, so the widest bar reaches the track edge instead of
        # every bar hugging the centre rule.
        bars = self.routes["_console_usage_rep_scorecard"]("cred-a")["dwell"]["bars"]
        for bar in bars:
            self.assertIn("value", bar)
            self.assertGreaterEqual(bar["value"], -1.0)
            self.assertLessEqual(bar["value"], 1.0)
            self.assertTrue(bar["delta_text"].endswith("%"))
        if bars:
            self.assertEqual(max(abs(bar["value"]) for bar in bars), 1.0)

    def test_ago_never_reports_a_never_seen_install_as_just_now(self):
        ago, now = self.routes["_ago"], self.now
        self.assertEqual(ago(None, now), "never seen")
        self.assertEqual(ago(now - timedelta(seconds=30), now), "just now")
        self.assertEqual(ago(now - timedelta(minutes=12), now), "12m ago")
        self.assertEqual(ago(now - timedelta(hours=5), now), "5h ago")
        self.assertEqual(ago(now - timedelta(days=5), now), "5d ago")

    def test_adoption_trend_counts_active_installs_and_marks_the_new_line_dashed(self):
        payload = self.routes["_console_usage_adoption_trend"](30)
        layers = payload["ranges"][0]["layers"]
        active_layer = next(layer for layer in layers if layer["id"] == "active")
        new_layer = next(layer for layer in layers if layer["id"] == "new")
        self.assertFalse(active_layer.get("dashed"))  # not set at all -> falsy, same as False
        self.assertTrue(new_layer["dashed"])
        # all three installs' sessions started within the last 2 days
        self.assertEqual(sum(new_layer["values"]), 3)

    def test_top_surfaces_list_ranks_by_open_count_with_a_normalized_bar(self):
        payload = self.routes["_console_usage_top_surfaces_list"](30)
        rows = payload["rows"]
        self.assertEqual(rows[0]["id"], "Gifting Catalog")  # 3 opens, the most
        self.assertEqual(rows[0]["opens"]["value"], 1.0)  # normalized against itself
        self.assertEqual(rows[0]["opens"]["text"], "3")

    def test_kpi_strip_annotates_every_cell_and_never_fakes_an_untracked_one(self):
        payload = self.routes["_console_usage_kpi_strip"](30)
        cells = {cell["label"]: cell for cell in payload["kpis"]}
        self.assertEqual(len(payload["kpis"]), 8)  # the design's eight cells
        # Every cell states where its number comes from, the way the design does.
        self.assertTrue(all(cell["note"] for cell in payload["kpis"]))
        self.assertEqual(cells["New installs"]["value"], "3")  # all three seeded installs
        self.assertEqual(cells["New installs"]["note"], "SESSION min")
        # The strip's error rate spans the WHOLE window (1 of 19 feature
        # events), unlike the Integrity block's per-day series — same column,
        # different grain, and both are stated in their own note.
        self.assertEqual(cells["Error rate"]["value"], "5.3%")
        # The one metric with no read-side path today says so instead of
        # rendering a plausible-looking zero.
        self.assertEqual(cells["Time to first action"]["value"], "—")
        self.assertEqual(cells["Time to first action"]["note"], "NOT TRACKED")

    def test_leaderboard_sort_control_reranks_server_side_with_the_rank_column(self):
        # cred-a leads on volume; cred-b touched a funnel stage cred-a's own
        # count can't beat on breadth, so the two orderings must differ in
        # SOME sortable dimension — and rank must always follow the order.
        reps = self.routes["_rep_aggregates"]()["reps"]
        for sort in ("actions", "funnel", "tools"):
            payload = self.routes["_console_usage_leaderboard"](sort)
            aggregate = self.routes["_LEADERBOARD_SORTS"][sort][0]
            self.assertEqual(payload["sort"]["key"], aggregate)
            # The rows really are ordered by THAT aggregate, descending — a
            # label alone would still pass if the ranking never changed.
            self.assertEqual([row["_select"] for row in payload["rows"]],
                             sorted(reps, key=lambda owner: -reps[owner][aggregate]))
            self.assertEqual([int(row["rank"]["text"]) for row in payload["rows"]],
                             list(range(1, len(payload["rows"]) + 1)))
        # An unknown sort falls back to the rate ranking instead of erroring.
        self.assertEqual(self.routes["_console_usage_leaderboard"]("nonsense")["rows"][0]["_select"],
                         self.routes["_console_usage_leaderboard"]("actions")["rows"][0]["_select"])

    def test_concurrency_chart_carries_the_designs_footer_rail(self):
        payload = self.routes["_console_usage_concurrency"]()
        window = payload["ranges"][0]
        self.assertEqual(len(window["series"]), 24)  # one bucket per hour
        rail = [entry["value"] for entry in window["stats"]]
        # The card header owns the live count; the rail owns the 24h bounds
        # and the peak/median summary between them.
        self.assertEqual(rail[0], "00:00")
        self.assertEqual(rail[2], "23:00")
        self.assertEqual(rail[1], f"peak {payload['peak']} · median {payload['median']}")

    def test_percentile_trend_leads_with_p95_dashes_p99_and_names_its_slo_line(self):
        payload = self.routes["_console_reliability_trend"](30)
        # `ms`, not `int`: the chart renders 1500 as "1.50s", never "$1,500.00".
        self.assertEqual(payload["fmt"], "ms")
        window = payload["ranges"][0]
        self.assertEqual(window["threshold"], 800)
        self.assertEqual(window["thresholdLabel"], "SLO 800ms")
        layers = window["layers"]
        # p95 leads so it is the filled curve, exactly as the design fills it.
        self.assertEqual([layer["id"] for layer in layers], ["p95", "p50", "p99"])
        self.assertFalse(layers[0].get("dashed"))
        self.assertFalse(layers[1].get("dashed"))
        self.assertTrue(layers[2]["dashed"])  # the p99 tail is a reference line
        # Percentiles never sum, so the card reads from this rail instead of a
        # headline: nearest-rank over the window's own 100/200/900/1500 samples.
        stats = {entry["label"]: entry["value"] for entry in window["stats"]}
        self.assertEqual(stats["p50"], "200ms")
        self.assertEqual(stats["p95"], "1.50s")
        self.assertEqual(stats["p99"], "1.50s")
        self.assertEqual(stats[""], "4 latency events")

    def test_integrity_rates_stay_numeric_and_carry_their_window_peak(self):
        payload = self.routes["_console_reliability_integrity"](30)
        rows = {row["id"]: row for row in payload["rows"]}
        errors, dropped = rows["errors"], rows["dropped"]
        # The rate is org-wide per day, not per install: the seeded day carries
        # 9 `feature` events across every install and exactly 1 of them failed
        # → 1/9; 2 of that session's 8 events dropped → 25%. Asserted as the
        # window PEAK, not the last bucket, so the test cannot flip on a UTC
        # day rollover.
        self.assertAlmostEqual(max(errors["values"]), 100 / 9, places=6)
        self.assertEqual(max(dropped["values"]), 25.0)
        # The headline value is the window's latest bucket, always.
        self.assertEqual(errors["value"], round(errors["values"][-1], 2))
        self.assertEqual(dropped["value"], round(dropped["values"][-1], 2))
        # Numeric + `pct` (not a pre-baked "50.0%" string), so the card can
        # animate the value and swap in the hovered day while scrubbing.
        self.assertEqual(errors["format"], "pct")
        self.assertIsInstance(errors["value"], float)
        self.assertEqual(errors["label"], "error rate · ok = false")
        self.assertEqual(dropped["label"], "dropped events per session")
        self.assertEqual(errors["note"], "30d peak 11.1%")
        self.assertEqual(len(errors["values"]), 30)  # one point per window day

    def test_activity_heatmap_lists_sunday_first_and_buckets_by_real_hour(self):
        payload = self.routes["_console_usage_activity_heatmap"](30)
        self.assertEqual(payload["col_labels"][0], "0")
        self.assertEqual(len(payload["col_labels"]), 24)
        self.assertEqual([row["label"] for row in payload["rows"]][0], self.routes["_HEATMAP_DAYS"][6])
        total_events = sum(sum(row["cells"]) for row in payload["rows"])
        self.assertGreater(total_events, 0)


if __name__ == "__main__":
    unittest.main()
