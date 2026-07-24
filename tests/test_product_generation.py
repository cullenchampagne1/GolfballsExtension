"""Durable product-image lifecycle and Codex provider boundary tests."""

import asyncio
import importlib.util
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

from sqlalchemy import Column, DateTime, Integer, JSON, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / ".revstack" / "logic" / "product_generation.py"
SPEC = importlib.util.spec_from_file_location(
    "golfballs_product_generation_test", MODULE_PATH
)
PRODUCTS = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = PRODUCTS
SPEC.loader.exec_module(PRODUCTS)

PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n"
    b"\x00\x00\x00\rIHDR"
    b"\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00"
    b"\x1f\x15\xc4\x89"
    b"\x00\x00\x00\rIDAT\x08\xd7c\xf8\xcf\xc0\xf0\x1f\x00\x05\x00\x01"
    b"\xff\x89\x99=\x1d"
    b"\x00\x00\x00\x00IEND\xaeB`\x82"
)


class Base(DeclarativeBase):
    pass


class ImageJob(Base):
    __tablename__ = "extension_product_image_jobs"

    id = Column(String(40), primary_key=True)
    owner_id = Column(String(96), nullable=False, index=True)
    owner_credential_id = Column(String(36), nullable=True, index=True)
    request_id = Column(String(80), nullable=False)
    product_id = Column(String(100), nullable=False, index=True)
    product_name = Column(String(160), nullable=False)
    prompt_version = Column(String(80), nullable=False)
    prompt_digest = Column(String(64), nullable=False)
    brief = Column(Text, nullable=False)
    input_manifest = Column(JSON, nullable=False, default=dict)
    provider = Column(String(32), nullable=False)
    provider_run_id = Column(String(120), nullable=True)
    provider_metadata = Column(JSON, nullable=False, default=dict)
    status = Column(String(32), nullable=False, index=True)
    stage = Column(String(32), nullable=False)
    status_message = Column(String(300), nullable=False)
    attempt = Column(Integer, nullable=False)
    output_path = Column(Text, nullable=True)
    output_filename = Column(String(180), nullable=True)
    output_media_type = Column(String(80), nullable=True)
    output_size_bytes = Column(Integer, nullable=True)
    output_sha256 = Column(String(64), nullable=True)
    error_code = Column(String(80), nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)


class ConfigNotFoundError(RuntimeError):
    pass


class MissingConfig:
    def read(self, _name):
        raise ConfigNotFoundError("not configured")


class StaticConfig:
    def __init__(self, value):
        self.value = value

    def read(self, _name):
        source = json.dumps(self.value, sort_keys=True)
        return "yaml", source, self.value


class FakeProvider:
    def status(self):
        return {
            "id": PRODUCTS.PROVIDER_ID,
            "available": True,
            "mode": "test",
            "streaming": False,
        }

    async def generate(self, *, prompt, work_dir, progress):
        self.prompt = prompt
        await progress("generating", "Generating the test image")
        path = work_dir / "output" / "result.png"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(PNG_BYTES)
        await progress("saving", "Saving the test image")
        return {
            "path": str(path.resolve()),
            "filename": path.name,
            "media_type": "image/png",
            "size_bytes": path.stat().st_size,
            "sha256": __import__("hashlib").sha256(PNG_BYTES).hexdigest(),
            "provider_run_id": "thr_test",
            "metadata": {"transport": "test", "streaming": False},
        }


class BlockingProvider(FakeProvider):
    def __init__(self):
        self.started = asyncio.Event()

    async def generate(self, *, prompt, work_dir, progress):
        await progress("generating", "Generating the test image")
        self.started.set()
        await asyncio.Event().wait()


class ProductPromptRegistryTests(unittest.TestCase):
    def test_missing_managed_file_uses_bounded_diagnostic_recipe(self):
        registry = PRODUCTS.ProductPromptRegistry(MissingConfig())
        products = registry.public_products()
        self.assertEqual([row["id"] for row in products], ["diagnostic-cat"])
        self.assertNotIn("prompt", products[0])
        self.assertEqual(registry.status()["source"], "builtin")

    def test_invalid_managed_file_fails_closed(self):
        registry = PRODUCTS.ProductPromptRegistry(
            StaticConfig({"schema_version": 2, "products": []})
        )
        with self.assertRaises(PRODUCTS.ProductConfigurationError):
            registry.public_products()
        self.assertFalse(registry.status()["ready"])

    def test_managed_recipe_metadata_never_discloses_prompt(self):
        config = StaticConfig({
            "schema_version": 1,
            "products": [{
                "id": "embroidered-hat",
                "name": "Embroidered hat",
                "description": "A structured cap mockup.",
                "enabled": True,
                "mode": "edit",
                "prompt_version": "hat-v1",
                "accepts_source_image": True,
                "prompt": "Render the approved mark as realistic embroidered thread.",
            }],
        })
        registry = PRODUCTS.ProductPromptRegistry(config)
        public = registry.public_products()[0]
        self.assertEqual(public["id"], "embroidered-hat")
        self.assertTrue(public["accepts_source_image"])
        self.assertNotIn("prompt", public)
        first_revision = registry.status()["revision"]
        config.value["products"][0]["prompt_version"] = "hat-v2"
        refreshed = registry.public_products()[0]
        self.assertEqual(refreshed["prompt_version"], "hat-v2")
        self.assertNotEqual(registry.status()["revision"], first_revision)


class ProductImageJobManagerTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.engine = create_engine(
            f"sqlite:///{self.root / 'jobs.db'}",
            connect_args={"check_same_thread": False},
        )
        Base.metadata.create_all(self.engine)
        self.provider = FakeProvider()
        self.manager = PRODUCTS.ProductImageJobManager(
            engine=self.engine,
            job_model=ImageJob,
            project_dir=ROOT,
            config_reader=MissingConfig(),
            provider=self.provider,
            storage_root=self.root / "artifacts",
        )

    async def asyncTearDown(self):
        tasks = list(self.manager._tasks.values())
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        self.engine.dispose()
        self.temp.cleanup()

    async def test_job_completes_persists_result_and_is_idempotent(self):
        first = await self.manager.start(
            owner_id="api_key:key-a",
            owner_credential_id="key-a",
            request_id="request:cat:0001",
            product_id="diagnostic-cat",
            brief="Make the cat a cheerful orange tabby.",
        )
        completed = await self.manager.wait(first["job_id"])
        repeated = await self.manager.start(
            owner_id="api_key:key-a",
            owner_credential_id="key-a",
            request_id="request:cat:0001",
            product_id="diagnostic-cat",
            brief="This different brief must not duplicate the request.",
        )
        self.assertEqual(completed["status"], "completed")
        self.assertEqual(repeated["job_id"], first["job_id"])
        self.assertEqual(completed["owner_id"], "api_key:key-a")
        self.assertEqual(completed["provider_run_id"], "thr_test")
        self.assertEqual(completed["result"]["media_type"], "image/png")
        self.assertEqual(completed["progress"], {
            "mode": "stage_hint", "percent_hint": 100, "streaming": False,
        })
        self.assertIsNone(completed["poll_after_ms"])
        self.assertRegex(completed["result"]["sha256"], r"^[a-f0-9]{64}$")
        path, media_type, filename = self.manager.result_path(
            owner_id="api_key:key-a", job_id=first["job_id"]
        )
        self.assertTrue(path.is_file())
        self.assertEqual(media_type, "image/png")
        self.assertEqual(filename, "result.png")
        self.assertIn("Managed product recipe (builtin-cat-v1)", self.provider.prompt)
        self.assertIn("cheerful orange tabby", self.provider.prompt)
        self.assertNotIn("different brief", self.provider.prompt)

    async def test_job_and_result_are_hidden_from_other_installations(self):
        queued = await self.manager.start(
            owner_id="api_key:key-a",
            owner_credential_id="key-a",
            request_id="request:cat:0002",
            product_id="diagnostic-cat",
            brief="Create the test image.",
        )
        await self.manager.wait(queued["job_id"])
        with self.assertRaises(PRODUCTS.ProductJobNotFound):
            self.manager.get(
                owner_id="api_key:key-b", job_id=queued["job_id"]
            )
        with self.assertRaises(PRODUCTS.ProductJobNotFound):
            self.manager.result_path(
                owner_id="api_key:key-b", job_id=queued["job_id"]
            )

    async def test_active_job_can_be_cancelled_and_stays_terminal(self):
        provider = BlockingProvider()
        manager = PRODUCTS.ProductImageJobManager(
            engine=self.engine,
            job_model=ImageJob,
            project_dir=ROOT,
            config_reader=MissingConfig(),
            provider=provider,
            storage_root=self.root / "blocking-artifacts",
        )
        queued = await manager.start(
            owner_id="api_key:key-a",
            owner_credential_id="key-a",
            request_id="request:cat:0003",
            product_id="diagnostic-cat",
            brief="Create the cancellable test image.",
        )
        await asyncio.wait_for(provider.started.wait(), timeout=2)
        cancelled = await manager.cancel(
            owner_id="api_key:key-a", job_id=queued["job_id"]
        )
        repeated = await manager.cancel(
            owner_id="api_key:key-a", job_id=queued["job_id"]
        )
        self.assertEqual(cancelled["status"], "cancelled")
        self.assertEqual(repeated["status"], "cancelled")

    async def test_job_cancelled_before_first_worker_timeslice_is_not_left_queued(self):
        queued = await self.manager.start(
            owner_id="api_key:key-a",
            owner_credential_id="key-a",
            request_id="request:cat:0005",
            product_id="diagnostic-cat",
            brief="Create the never-started test image.",
        )
        cancelled = await self.manager.cancel(
            owner_id="api_key:key-a", job_id=queued["job_id"]
        )
        self.assertEqual(cancelled["status"], "cancelled")
        self.assertEqual(cancelled["stage"], "cancelled")
        self.assertNotIn(queued["job_id"], self.manager._tasks)

    async def test_status_exposes_real_counts_without_streaming_claims(self):
        queued = await self.manager.start(
            owner_id="api_key:key-a",
            owner_credential_id="key-a",
            request_id="request:cat:0004",
            product_id="diagnostic-cat",
            brief="Create another test image.",
        )
        await self.manager.wait(queued["job_id"])
        status = self.manager.status()
        self.assertTrue(status["ready"])
        self.assertFalse(status["provider"]["streaming"])
        self.assertEqual(status["jobs"]["completed"], 1)
        self.assertEqual(status["jobs"]["active"], 0)


class CodexLocalProviderTests(unittest.IsolatedAsyncioTestCase):
    async def test_provider_uses_subscription_lane_stdin_and_confined_output(self):
        with tempfile.TemporaryDirectory() as directory:
            work_dir = Path(directory)
            captured = {}

            class Process:
                returncode = 0

                async def communicate(self, data=None):
                    captured["stdin"] = data
                    output = work_dir / "output" / "result.png"
                    output.parent.mkdir(parents=True, exist_ok=True)
                    output.write_bytes(PNG_BYTES)
                    return (
                        b'{"type":"thread.started","thread_id":"thr_provider"}\n',
                        b"",
                    )

                def kill(self):
                    captured["killed"] = True

            async def create_process(*args, **kwargs):
                captured["args"] = args
                captured["env"] = kwargs["env"]
                return Process()

            async def progress(stage, message):
                captured.setdefault("stages", []).append((stage, message))

            provider = PRODUCTS.CodexLocalImageProvider(
                binary=sys.executable, timeout_seconds=30
            )
            with patch.dict(
                os.environ,
                {"OPENAI_API_KEY": "must-not-pass", "OPENAI_BASE_URL": "https://bad"},
            ), patch.object(
                PRODUCTS.asyncio, "create_subprocess_exec", create_process
            ):
                result = await provider.generate(
                    prompt="Generate the approved diagnostic.",
                    work_dir=work_dir,
                    progress=progress,
                )

            args = captured["args"]
            self.assertIn("--ephemeral", args)
            self.assertIn("--json", args)
            self.assertIn("image_generation", args)
            self.assertIn("--ignore-user-config", args)
            self.assertIn("--ignore-rules", args)
            self.assertNotIn("Generate the approved diagnostic.", args)
            self.assertEqual(
                captured["stdin"], b"Generate the approved diagnostic."
            )
            self.assertNotIn("OPENAI_API_KEY", captured["env"])
            self.assertNotIn("OPENAI_BASE_URL", captured["env"])
            self.assertEqual(result["provider_run_id"], "thr_provider")
            self.assertEqual(result["media_type"], "image/png")


class ProductGenerationRegistrationTests(unittest.TestCase):
    def test_routes_blocks_docs_and_dashboard_test_are_registered(self):
        routes = (ROOT / ".revstack" / "routes.py").read_text()
        blocks = (ROOT / ".revstack" / "blocks.py").read_text()
        manifest = json.loads((ROOT / "revstack.project.json").read_text())
        package = json.loads((ROOT / "package.json").read_text())
        docs = manifest["api_docs"]["routes"]
        self.assertIn(
            "POST /client/product-generation/jobs", docs
        )
        self.assertIn(
            "POST /product-generation/admin/test", docs
        )
        self.assertIn(
            '@router.get("/client/product-generation/health")', routes
        )
        self.assertIn(
            '@router.get("/product-generation/admin/jobs")', routes
        )
        self.assertIn('"product-image-jobs"', blocks)
        self.assertIn("product-image-test", blocks)
        registrations = {
            item.get("id"): item for item in package.get("tests", [])
        }
        self.assertIn("guard-product-image-jobs", registrations)


if __name__ == "__main__":
    unittest.main()
