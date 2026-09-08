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

#: A span the trimming tests place samples inside, wide enough that its
#: buckets are days rather than hours.
_TRIM_SPAN = 30


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
        # Relative to the real clock, not a hardcoded date. Every endpoint
        # here windows against `datetime.utcnow()`, so a fixture pinned to a
        # fixed day drifts out of its own windows as time passes — the
        # percentile trend's 7-day window quietly lost its oldest sample and
        # the p95 assertion started failing on a calendar boundary rather than
        # on a code change.
        cls.now = datetime.utcnow().replace(hour=12, minute=0, second=0, microsecond=0)
        if cls.now > datetime.utcnow():
            cls.now -= timedelta(days=1)
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
            # Spread across days, not all at one instant: the trend needs two
            # measured buckets to be a trend at all, and a single bucket
            # carried forward as a flat line is the fabrication the card was
            # fixed to stop drawing. The window percentiles are unchanged —
            # they read every sample in the window regardless of when.
            for offset, duration in enumerate((100, 200, 900, 1500)):
                session.add(ExtensionUsageEvent(
                    owner_credential_id="cred-a", session_id="sess-a", kind="latency",
                    duration_ms=duration, ok=True,
                    occurred_at=cls.now - timedelta(days=offset, hours=1)))

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
                "_USAGE_TRANSPORT_LABELS", "_REP_WINDOW_DAYS", "_rep_aggregates", "_ago",
                "_console_usage_leaderboard", "_console_usage_rep_scorecard", "_console_usage_identity",
                "_console_usage_adoption_trend", "_console_usage_adoption",
                "_console_usage_activity_heatmap", "_HEATMAP_DAYS",
                "_console_reliability_trend", "_console_reliability_integrity",
                "_bucket_samples", "_level_curve", "_latency_range",
                "_windowed_ranges", "_TREND_WINDOWS",
                "_LATENCY_BUCKETS", "_LATENCY_WINDOWS", "_WINDOW_LABEL",
                "_LATENCY_OUTLIER_MS", "_LEADERBOARD_SORTS", "_console_usage_concurrency",
                "_presence_hourly_buckets", "_console_usage_kpi_strip", "_KPI_PROVENANCE",
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

    def test_adoption_trend_draws_active_returning_and_new(self):
        """Three curves, as the design does — and the third is the point.

        `Returning` is active minus new, so the GAP between Active and
        Returning is the day's new installs and the reader can see whether a
        busy day was growth or the same people coming back. It shipped with two
        curves and left that subtraction to the eye.
        """
        payload = self.routes["_console_usage_adoption_trend"](30)
        layers = {layer["id"]: layer for layer in payload["ranges"][0]["layers"]}
        self.assertEqual(list(layers), ["active", "returning", "new"])
        # Dashed because DERIVED, which is the design's own choice: measured
        # curves are solid, the one worked out from them is not.
        self.assertFalse(layers["active"].get("dashed"))
        self.assertFalse(layers["new"].get("dashed"))
        self.assertTrue(layers["returning"]["dashed"])
        # all three installs' sessions started within the last 2 days
        self.assertEqual(sum(layers["new"]["values"]), 3)
        # And the arithmetic holds point by point, never below zero.
        for active, returning, new in zip(layers["active"]["values"],
                                          layers["returning"]["values"],
                                          layers["new"]["values"]):
            self.assertEqual(returning, max(0, active - new))
            self.assertGreaterEqual(returning, 0)

    def test_a_count_trend_drops_the_span_before_anything_was_tracked(self):
        """The other half of "showing a time frame there's no data".

        A daily COUNT is genuinely zero on a day with no events, so an interior
        zero stays — but the leading run of them is the span before this
        project had any telemetry at all, and on a young install that run is
        most of a 90-day axis. Trimmed, so the curve gets the plot.
        """
        windowed = self.routes["_windowed_ranges"]
        keys = [f"2026-09-{day:02d}" for day in range(1, 31)]
        times = list(range(30))
        # Nothing until the 21st, then three real days.
        values = [0] * 20 + [4, 7, 5] + [0] * 7
        ranges = windowed(keys, times, [{"id": "a", "label": "A", "values": values}])
        for window in ranges:
            self.assertEqual(window["series"][0], 4, "the first point is the first real day")
            self.assertEqual(len(window["times"]), len(window["series"]))
        # The 7-day window holds only zeroes, so it is not offered at all.
        self.assertNotIn("7d", [window["id"] for window in ranges])

    def test_a_count_trend_keeps_an_interior_zero_because_it_is_a_measurement(self):
        windowed = self.routes["_windowed_ranges"]
        keys = [f"2026-09-{day:02d}" for day in range(1, 31)]
        values = [0] * 27 + [3, 0, 5]
        ranges = windowed(keys, list(range(30)), [{"id": "a", "label": "A", "values": values}])
        seven = next(window for window in ranges if window["id"] == "7d")
        self.assertEqual(seven["series"], [3, 0, 5], "nobody used it that day IS the answer")

    def test_every_offered_window_states_its_span_and_label(self):
        windowed = self.routes["_windowed_ranges"]
        keys = [f"d{index}" for index in range(90)]
        ranges = windowed(keys, list(range(90)),
                          [{"id": "a", "label": "A", "values": [1] * 90}])
        self.assertEqual([window["id"] for window in ranges], ["7d", "30d", "90d"])
        for window in ranges:
            self.assertEqual(window["label"], self.routes["_WINDOW_LABEL"][window["days"]])
            self.assertEqual(len(window["series"]), window["days"])

    def test_a_window_recomputes_the_headline_it_shows(self):
        # Switching to 7D must not leave a 90-day delta sitting over a
        # seven-day curve — the whole reason the figures ride the RANGE.
        payload = self.routes["_console_usage_adoption_trend"](30)
        for window in payload["ranges"]:
            self.assertIn("value", window)
            self.assertIn("delta", window)
        if len(payload["ranges"]) > 1:
            texts = {window["delta"]["text"] for window in payload["ranges"]}
            self.assertTrue(texts, "each window carries its own delta text")

    def test_adoption_trend_holds_the_headline_on_the_range(self):
        # `installActive`/`installDelta` were bound by a hand-built header row
        # above the chart. The view draws the headline itself, off the RANGE, so
        # the figure cannot disagree with the curve under it.
        active_range = self.routes["_console_usage_adoption_trend"](30)["ranges"][0]
        self.assertIn("value", active_range)
        self.assertIn("text", active_range["delta"])
        self.assertIsInstance(active_range["delta"]["up"], bool)

    def test_top_surfaces_is_the_adoption_endpoint_because_it_was_one_query(self):
        # `usage.top-surfaces-list` was the SAME query as `usage.adoption` —
        # surface, opens, average dwell, ordered by opens — shaped twice
        # because the design drew one as a table and the other as meters. The
        # duplicate is gone; this is the survivor, and it is the richer of the
        # two (it carries the surface KIND and the window's own footer trend).
        self.assertNotIn("_console_usage_top_surfaces_list", self.routes)
        payload = self.routes["_console_usage_adoption"](30)
        rows = payload["items"]
        self.assertEqual(rows[0]["label"], "Gifting Catalog")  # 3 opens, the most
        self.assertEqual(rows[0]["ratio"], 1.0)  # against the TOP surface, not the total
        self.assertEqual(rows[0]["value"], 3)
        self.assertTrue(rows[0]["state"], "the surface kind the list version dropped")
        self.assertTrue(payload["footer"]["series"])

    def test_kpi_strip_annotates_every_cell_and_never_fakes_an_untracked_one(self):
        payload = self.routes["_console_usage_kpi_strip"](30)
        cells = {cell["label"]: cell for cell in payload["items"]}
        # SEVEN, not eight: "Time to first action" read "—" in every window
        # because it has no read-side path, and a cell that says "not measured"
        # is clutter on a strip whose job is to state seven real numbers.
        self.assertEqual(len(payload["items"]), 7)
        self.assertEqual(len(self.routes["_KPI_PROVENANCE"]), 7)
        self.assertNotIn("Time to first action", cells)
        # Every cell states where its number comes from, the way the design
        # does. `sub`, because that is `stat.grid`'s name for the line under a
        # figure — it was `note`, which was a `Metric` prop.
        self.assertTrue(all(cell["sub"] for cell in payload["items"]))
        self.assertEqual(cells["New installs"]["value"], "3")  # all three seeded installs
        self.assertEqual(cells["New installs"]["sub"], "SESSION min")
        # The strip's error rate spans the WHOLE window (1 of 19 feature
        # events), unlike the Integrity block's per-day series — same column,
        # different grain, and both are stated in their own note.
        self.assertEqual(cells["Error rate"]["value"], "5.3%")
        # A cell with no samples still reads "—" rather than 0 — the rule that
        # kept "Time to first action" honest for as long as it was on the
        # strip. It is the cells that can NEVER have samples that are gone.
        self.assertTrue(all(cell["value"] for cell in payload["items"]))

    def test_leaderboard_sort_control_reranks_server_side_with_the_rank_column(self):
        # cred-a leads on volume; cred-b touched a funnel stage cred-a's own
        # count can't beat on breadth, so the two orderings must differ in
        # SOME sortable dimension — and rank must always follow the order.
        reps = self.routes["_rep_aggregates"]()["reps"]
        for sort in ("actions", "funnel", "tools"):
            payload = self.routes["_console_usage_leaderboard"](sort)
            aggregate = self.routes["_LEADERBOARD_SORTS"][sort][0]
            # `sort.key` is the REQUEST value, not the internal aggregate
            # field: it has to round-trip through the card's control, so it
            # must be one of the choices that control offers.
            self.assertEqual(payload["sort"]["key"], sort)
            self.assertEqual(payload["sort"]["label"],
                             self.routes["_LEADERBOARD_SORTS"][sort][1])
            offered = [choice["value"] for choice in payload["sort"]["options"]]
            self.assertEqual(offered, list(self.routes["_LEADERBOARD_SORTS"]))
            self.assertIn(payload["sort"]["key"], offered)
            # The rows really are ordered by THAT aggregate, descending — a
            # label alone would still pass if the ranking never changed.
            self.assertEqual([row["_select"] for row in payload["rows"]],
                             sorted(reps, key=lambda owner: -reps[owner][aggregate]))
            self.assertEqual([int(row["rank"]["text"]) for row in payload["rows"]],
                             list(range(1, len(payload["rows"]) + 1)))
        # An unknown sort falls back to the rate ranking instead of erroring —
        # and the control reports the choice it actually HONOURED, so a stale
        # option cannot leave a pill lit that describes a different ranking.
        fallback = self.routes["_console_usage_leaderboard"]("nonsense")
        self.assertEqual(fallback["rows"][0]["_select"],
                         self.routes["_console_usage_leaderboard"]("actions")["rows"][0]["_select"])
        self.assertEqual(fallback["sort"]["key"], "actions")

    def test_concurrency_chart_labels_every_hour_it_plots(self):
        payload = self.routes["_console_usage_concurrency"]()
        window = payload["ranges"][0]
        # `points: [{label, value}]`, because that is what `chart.line` reads
        # and labels its time axis from. It used to send `times` (epoch millis)
        # beside a bare `series` of counts — `times` went to a `LineChart` prop
        # that no longer exists, and bare counts left the card with no axis at
        # all: a concurrency curve whose spike had no hour on it.
        self.assertEqual(len(window["points"]), 24)  # one bucket per hour
        self.assertTrue(all(point["label"].endswith(":00") for point in window["points"]))
        # The headline is the range's own, so it cannot disagree with the curve.
        self.assertIn("value", window)
        rail = {entry["label"]: entry["value"] for entry in window["stats"]}
        self.assertIn("peak", rail)
        self.assertIn("median", rail)
        # And the install total rides along for the header tag the block
        # publishes — the design's "27 live / 128 installs" denominator.
        self.assertIn("installTotal", payload)

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
        self.assertEqual(stats[""], "4 samples")

    def test_percentile_trend_offers_its_own_windows_and_leads_with_a_full_one(self):
        """The window is this card's control, not the page's.

        A 90-day default on a week-old install is mostly empty axis, and
        showing a span with no data in it was half of why this card could not
        be read. It offers 24H/7D/30D/90D, drops the ones with nothing in them,
        and leads with the narrowest that survives.
        """
        payload = self.routes["_console_reliability_trend"](30)
        ids = [window["id"] for window in payload["ranges"]]
        self.assertTrue(ids, "the seeded samples fall in at least one window")
        self.assertEqual(payload["default"], ids[0])
        # Narrowest first, and each states its span so the view can animate a
        # switch as a camera move rather than morphing unrelated points.
        spans = [window["days"] for window in payload["ranges"]]
        self.assertEqual(spans, sorted(spans))
        for window in payload["ranges"]:
            self.assertEqual(window["label"], self.routes["_WINDOW_LABEL"][window["days"]])

    def test_a_quiet_bucket_holds_the_last_level_instead_of_claiming_zero(self):
        """The bug that pinned the curve to the axis.

        A latency percentile is a LEVEL: "no requests in this bucket" means the
        number is unknown, not that the service answered instantly. The
        endpoint used `_percentile(...) or 0` — exactly what that function's
        docstring warns against — so on real telemetry most buckets read 0ms
        and the few with samples read as outliers standing over a floor of
        zeroes.
        """
        curve = self.routes["_level_curve"]([[10, 20], [], [], [90, 100]], 0.95)
        self.assertEqual(curve, [20, 20, 20, 100])
        # Nothing before the first sample is invented; the caller trims those.
        self.assertEqual(self.routes["_level_curve"]([[], [5]], 0.5), [None, 5])

    def test_a_window_is_trimmed_to_its_first_and_last_real_measurement(self):
        now = datetime.utcnow()
        window = timedelta(days=_TRIM_SPAN)
        floor = now - window
        # Samples only in the middle of the window.
        scoped = [(120, floor + window * fraction) for fraction in (0.45, 0.5, 0.55)]
        built = self.routes["_latency_range"](_TRIM_SPAN, scoped, floor, window)
        self.assertIsNotNone(built)
        buckets = self.routes["_LATENCY_BUCKETS"]
        self.assertLess(len(built["series"]), buckets, "the empty ends are not drawn")
        self.assertEqual(len(built["times"]), len(built["series"]))
        for layer in built["layers"]:
            self.assertEqual(len(layer["values"]), len(built["series"]))

    def test_a_window_with_one_lonely_bucket_is_not_offered_as_a_trend(self):
        now = datetime.utcnow()
        window = timedelta(days=_TRIM_SPAN)
        floor = now - window
        single = [(120, floor + window * 0.5)]
        self.assertIsNone(self.routes["_latency_range"](_TRIM_SPAN, single, floor, window))
        self.assertIsNone(self.routes["_latency_range"](_TRIM_SPAN, [], floor, window))

    def test_integrity_rates_stay_numeric_and_carry_their_window_peak(self):
        payload = self.routes["_console_reliability_integrity"](30)
        # `items`, and each row carries `series`/`fmt` — `stat.trend`'s own
        # field names for a metric, since a row IS one of this view's bodies.
        rows = {row["id"]: row for row in payload["items"]}
        errors, dropped = rows["errors"], rows["dropped"]
        # The rate is org-wide per day, not per install: the seeded day carries
        # 9 `feature` events across every install and exactly 1 of them failed
        # → 1/9; 2 of that session's 8 events dropped → 25%. Asserted as the
        # window PEAK, not the last bucket, so the test cannot flip on a UTC
        # day rollover.
        self.assertAlmostEqual(max(errors["series"]), 100 / 9, places=6)
        self.assertEqual(max(dropped["series"]), 25.0)
        # The headline value is the window's latest bucket, always.
        self.assertEqual(errors["value"], round(errors["series"][-1], 2))
        self.assertEqual(dropped["value"], round(dropped["series"][-1], 2))
        # Numeric + `pct` (not a pre-baked "50.0%" string), so the card can
        # animate the value and swap in the hovered day while scrubbing.
        self.assertEqual(errors["fmt"], "pct")
        self.assertIsInstance(errors["value"], float)
        self.assertEqual(errors["label"], "error rate · ok = false")
        self.assertEqual(dropped["label"], "dropped events per session")
        self.assertEqual(errors["note"], "30d peak 11.1%")
        self.assertEqual(len(errors["series"]), 30)  # one point per window day
        # The set's shared facts ride the envelope rather than every row: two
        # rates in the same units repeating `fmt` is how two of them end up
        # disagreeing.
        self.assertEqual(payload["fmt"], "pct")
        self.assertEqual(payload["window_days"], 30)

    def test_activity_heatmap_lists_sunday_first_and_buckets_by_real_hour(self):
        payload = self.routes["_console_usage_activity_heatmap"](30)
        # `colLabels`, which is the spelling `chart.heatmap`'s payload contract
        # declares; `Matrix` took the snake_case prop.
        self.assertEqual(payload["colLabels"][0], "0")
        self.assertEqual(len(payload["colLabels"]), 24)
        self.assertEqual([row["label"] for row in payload["rows"]][0], self.routes["_HEATMAP_DAYS"][6])
        total_events = sum(sum(row["cells"]) for row in payload["rows"])
        self.assertGreater(total_events, 0)


if __name__ == "__main__":
    unittest.main()
