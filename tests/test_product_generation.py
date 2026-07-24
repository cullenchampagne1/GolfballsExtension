"""Durable product-image lifecycle and Codex provider boundary tests."""

import asyncio
import base64
import hashlib
import importlib.util
import json
import os
import sys
import tempfile
import unittest
import zipfile
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


class ImageBatch(Base):
    __tablename__ = "extension_product_image_batches"

    id = Column(String(40), primary_key=True)
    owner_id = Column(String(96), nullable=False, index=True)
    owner_credential_id = Column(String(36), nullable=True, index=True)
    request_id = Column(String(80), nullable=False)
    name = Column(String(120), nullable=False)
    configuration_revision = Column(String(64), nullable=False)
    scene_id = Column(String(40), nullable=True)
    aspect_id = Column(String(40), nullable=False)
    lighting_id = Column(String(40), nullable=True)
    variation_count = Column(Integer, nullable=True)
    source_variant_count = Column(Integer, nullable=False, default=0)
    imprint_variation_count = Column(Integer, nullable=False, default=0)
    selection_manifest = Column(JSON, nullable=False, default=dict)
    logo_filename = Column(String(180), nullable=True)
    product_count = Column(Integer, nullable=False)
    job_count = Column(Integer, nullable=False)
    status = Column(String(32), nullable=False, index=True)
    status_message = Column(String(300), nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)


class ImageJob(Base):
    __tablename__ = "extension_product_image_jobs"

    id = Column(String(40), primary_key=True)
    owner_id = Column(String(96), nullable=False, index=True)
    owner_credential_id = Column(String(36), nullable=True, index=True)
    batch_id = Column(String(40), nullable=True, index=True)
    batch_position = Column(Integer, nullable=True)
    variation_index = Column(Integer, nullable=True)
    source_variant_id = Column(String(100), nullable=True)
    source_variant_label = Column(String(160), nullable=True)
    imprint_variation_id = Column(String(100), nullable=True)
    imprint_variation_label = Column(String(160), nullable=True)
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


def configured_studio():
    return {
        "schema_version": 3,
        "constraints": {
            "max_products": 5,
            "max_images": 20,
        },
        "products": [{
            "id": "embroidered-hat",
            "title": "Performance Rope Cap",
            "brand": "Ahead",
            "category": "Headwear",
            "description": "Structured performance cap.",
            "display_image_url": "https://assets.example/hat/display.png",
            "enabled": True,
            "sort": 10,
            "prompt_version": "hat-v1",
            "prompt": (
                "Edit the registered structured cap photo while preserving its "
                "construction, materials, color, camera, crop, and background."
            ),
            "sources": [{
                "id": "navy",
                "label": "Navy",
                "description": "Navy cap",
                "reference_image_url": "https://assets.example/hat/navy.png",
                "thumbnail_url": "https://assets.example/hat/navy-thumb.png",
                "prompt": "Preserve the exact navy color.",
            }, {
                "id": "white",
                "label": "White",
                "description": "White cap",
                "reference_image_url": "https://assets.example/hat/white.png",
                "thumbnail_url": "https://assets.example/hat/white-thumb.png",
                "prompt": "Preserve the exact white color.",
            }],
            "variations": [{
                "id": "front-center",
                "label": "Front center",
                "description": "Centered front embroidery",
                "reference_image_url": (
                    "https://assets.example/hat/front-center.png"
                ),
                "thumbnail_url": (
                    "https://assets.example/hat/front-center-thumb.png"
                ),
                "prompt": (
                    "Embroider the logo at the exact front-center placement "
                    "demonstrated by the placement reference."
                ),
            }, {
                "id": "left-side",
                "label": "Left side",
                "description": "Left panel embroidery",
                "reference_image_url": (
                    "https://assets.example/hat/left-side.png"
                ),
                "thumbnail_url": (
                    "https://assets.example/hat/left-side-thumb.png"
                ),
                "prompt": (
                    "Embroider the logo on the left panel at the exact placement "
                    "demonstrated by the placement reference."
                ),
            }],
        }],
    }


def configured_faceted_studio():
    value = json.loads(json.dumps(configured_studio()))
    product = value["products"][0]
    product["prompt_version"] = "hat-faceted-v1"
    product["prompt"] = (
        "Edit Image 1 by placing the logo from Image 2 inside the marked "
        "decoration area while preserving everything outside that area."
    )
    product["option_groups"] = [{
        "id": "scene",
        "label": "Scene",
        "presentation": "thumbnail",
        "columns": 2,
        "options": [{
            "id": "studio",
            "label": "Studio",
        }],
    }, {
        "id": "color",
        "label": "Color",
        "presentation": "swatch",
        "columns": 3,
        "options": [{
            "id": "navy",
            "label": "Navy",
            "swatch": "#12264a",
        }, {
            "id": "white",
            "label": "White",
            "swatch": "#f5f5f0",
        }],
    }]
    product["sources"][0]["option_values"] = {
        "scene": "studio", "color": "navy",
    }
    product["sources"][1]["option_values"] = {
        "scene": "studio", "color": "white",
    }
    product["variations"] = [{
        "id": "personalized-logo",
        "label": "Personalized logo",
        "description": "Logo placed in the marked source-image area.",
        "prompt": "",
    }]
    return value


def logo_payload():
    return {
        "filename": "customer-logo.png",
        "media_type": "image/png",
        "data_base64": base64.b64encode(PNG_BYTES).decode("ascii"),
    }


class FakeReferenceFetcher:
    def __init__(self):
        self.urls = []

    async def fetch(self, url, destination):
        self.urls.append(url)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(PNG_BYTES)


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
        self.input_files = sorted(
            path.name for path in (work_dir / "input").glob("*")
        ) if (work_dir / "input").is_dir() else []
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
    def test_missing_managed_file_keeps_diagnostic_private_and_catalog_empty(self):
        registry = PRODUCTS.ProductPromptRegistry(MissingConfig())
        products = registry.public_products()
        self.assertEqual(products, [])
        diagnostic = registry.product(
            "diagnostic-cat", allow_diagnostic=True
        )
        self.assertIn("prompt", diagnostic)
        with self.assertRaises(PRODUCTS.ProductNotFound):
            registry.product("diagnostic-cat")
        self.assertEqual(registry.studio()["product_count"], 0)
        self.assertEqual(registry.studio()["constraints"]["max_images"], 20)
        self.assertEqual(registry.status()["source"], "builtin")

    def test_invalid_managed_file_fails_closed(self):
        registry = PRODUCTS.ProductPromptRegistry(
            StaticConfig({"schema_version": 2, "products": []})
        )
        with self.assertRaises(PRODUCTS.ProductConfigurationError):
            registry.public_products()
        self.assertFalse(registry.status()["ready"])

    def test_configured_sources_and_variations_never_disclose_prompts(self):
        config = StaticConfig(configured_studio())
        registry = PRODUCTS.ProductPromptRegistry(config)
        public = registry.public_products()[0]
        self.assertEqual(public["id"], "embroidered-hat")
        self.assertNotIn("prompt", public)
        self.assertNotIn("reference_image_url", public["sources"][0])
        self.assertNotIn("prompt", public["variations"][0])
        self.assertEqual(public["sources"][0]["label"], "Navy")
        self.assertEqual(public["variations"][0]["label"], "Front center")
        self.assertNotIn("aspects", registry.studio())
        first_revision = registry.status()["revision"]
        config.value["products"][0]["prompt_version"] = "hat-v2"
        refreshed = registry.public_products()[0]
        self.assertEqual(refreshed["prompt_version"], "hat-v2")
        self.assertNotEqual(registry.status()["revision"], first_revision)

    def test_faceted_sources_publish_safe_option_groups_and_exact_mappings(self):
        registry = PRODUCTS.ProductPromptRegistry(
            StaticConfig(configured_faceted_studio())
        )
        public = registry.public_products()[0]
        self.assertEqual(
            [group["id"] for group in public["option_groups"]],
            ["scene", "color"],
        )
        self.assertEqual(
            public["option_groups"][0]["presentation"], "thumbnail"
        )
        self.assertEqual(public["option_groups"][0]["columns"], 2)
        self.assertEqual(
            public["sources"][1]["option_values"],
            {"scene": "studio", "color": "white"},
        )
        self.assertEqual(
            public["option_groups"][1]["options"][0]["swatch"],
            "#12264a",
        )
        self.assertNotIn("prompt", public["variations"][0])
        self.assertNotIn("reference_image_url", public["variations"][0])

    def test_option_prompts_never_reach_the_client(self):
        """Options may carry a prompt; like every other prompt it is server-side."""
        studio = configured_faceted_studio()
        studio["products"][0]["option_groups"][0]["options"][0]["prompt"] = (
            "Show the product on a clean studio background."
        )
        registry = PRODUCTS.ProductPromptRegistry(StaticConfig(studio))

        internal = registry.product("embroidered-hat")["option_groups"][0]["options"][0]
        self.assertEqual(
            internal["prompt"], "Show the product on a clean studio background.",
            "the normalizer must keep the option prompt for composition",
        )

        public = registry.public_products()[0]
        option = public["option_groups"][0]["options"][0]
        self.assertNotIn("prompt", option)
        self.assertEqual(option["label"], "Studio", "labels still publish")
        self.assertNotIn(
            "clean studio background", json.dumps(public),
            "no option prompt text may appear anywhere in the client payload",
        )


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
            batch_model=ImageBatch,
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
            allow_diagnostic=True,
        )
        completed = await self.manager.wait(first["job_id"])
        repeated = await self.manager.start(
            owner_id="api_key:key-a",
            owner_credential_id="key-a",
            request_id="request:cat:0001",
            product_id="diagnostic-cat",
            brief="This different brief must not duplicate the request.",
            allow_diagnostic=True,
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
            allow_diagnostic=True,
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
            batch_model=ImageBatch,
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
            allow_diagnostic=True,
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
            allow_diagnostic=True,
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
            allow_diagnostic=True,
        )
        await self.manager.wait(queued["job_id"])
        status = self.manager.status()
        self.assertTrue(status["ready"])
        self.assertFalse(status["provider"]["streaming"])
        self.assertEqual(status["jobs"]["completed"], 1)
        self.assertEqual(status["jobs"]["active"], 0)

    async def test_batch_expands_persists_archives_and_is_idempotent(self):
        reference_fetcher = FakeReferenceFetcher()
        provider = FakeProvider()
        manager = PRODUCTS.ProductImageJobManager(
            engine=self.engine,
            batch_model=ImageBatch,
            job_model=ImageJob,
            project_dir=ROOT,
            config_reader=StaticConfig(configured_studio()),
            provider=provider,
            reference_fetcher=reference_fetcher,
            storage_root=self.root / "batch-artifacts",
        )
        queued = await manager.start_batch(
            owner_id="api_key:key-a",
            owner_credential_id="key-a",
            request_id="request:batch:0001",
            name="David spring hats",
            selections=[{
                "product_id": "embroidered-hat",
                "source_ids": ["navy", "white"],
                "variation_ids": ["front-center", "left-side"],
            }],
            logo=logo_payload(),
        )
        for job in queued["jobs"]:
            await manager.wait(job["job_id"])
        completed = manager.get_batch(
            owner_id="api_key:key-a", batch_id=queued["batch_id"]
        )
        repeated = await manager.start_batch(
            owner_id="api_key:key-a",
            owner_credential_id="key-a",
            request_id="request:batch:0001",
            name="This name must not create another batch",
            selections=[{
                "product_id": "embroidered-hat",
                "source_ids": ["white"],
                "variation_ids": ["front-center"],
            }],
            logo=logo_payload(),
        )
        self.assertEqual(completed["status"], "completed")
        self.assertEqual(completed["progress"]["completed"], 4)
        self.assertEqual(completed["progress"]["percent"], 100)
        self.assertEqual(repeated["batch_id"], queued["batch_id"])
        self.assertEqual(completed["selection"]["aspect_id"], "square")
        self.assertEqual(completed["source_variant_count"], 2)
        self.assertEqual(completed["imprint_variation_count"], 2)
        self.assertEqual(
            [job["source"]["id"] for job in completed["jobs"]],
            ["navy", "navy", "white", "white"],
        )
        self.assertEqual(
            [job["variation"]["id"] for job in completed["jobs"]],
            ["front-center", "left-side", "front-center", "left-side"],
        )
        self.assertIn("Base product photo:", provider.prompt)
        self.assertIn("Customer logo artwork:", provider.prompt)
        self.assertIn("left panel", provider.prompt)
        self.assertEqual(provider.input_files, [
            "logo.png", "placement-reference.png", "product-reference.png",
        ])
        self.assertEqual(len(reference_fetcher.urls), 4)
        archive, media_type, filename = manager.archive_path(
            owner_id="api_key:key-a", batch_id=queued["batch_id"]
        )
        self.assertEqual(media_type, "application/zip")
        self.assertEqual(filename, "David-spring-hats.zip")
        with zipfile.ZipFile(archive) as bundle:
            self.assertEqual(len(bundle.namelist()), 4)
            self.assertTrue(all(name.endswith(".png") for name in bundle.namelist()))
        with self.assertRaises(PRODUCTS.ProductJobNotFound):
            manager.get_batch(
                owner_id="api_key:key-b", batch_id=queued["batch_id"]
            )

    async def test_corrupt_cached_reference_is_discarded_and_downloaded_again(self):
        reference_fetcher = FakeReferenceFetcher()
        manager = PRODUCTS.ProductImageJobManager(
            engine=self.engine,
            batch_model=ImageBatch,
            job_model=ImageJob,
            project_dir=ROOT,
            config_reader=StaticConfig(configured_studio()),
            provider=FakeProvider(),
            reference_fetcher=reference_fetcher,
            storage_root=self.root / "reference-recovery-artifacts",
        )
        url = "https://cdn.example.com/hat/navy.png"
        cached = await manager._cached_reference(url, ".png")
        cached.write_bytes(b"not-an-image")
        recovered = await manager._cached_reference(url, ".png")
        self.assertEqual(recovered.read_bytes(), PNG_BYTES)
        self.assertEqual(reference_fetcher.urls, [url, url])
        self.assertEqual(
            recovered.name,
            f"{hashlib.sha256(url.encode('utf-8')).hexdigest()}.png",
        )

    async def test_faceted_source_without_separate_placement_uses_image_one_and_two(self):
        reference_fetcher = FakeReferenceFetcher()
        provider = FakeProvider()
        manager = PRODUCTS.ProductImageJobManager(
            engine=self.engine,
            batch_model=ImageBatch,
            job_model=ImageJob,
            project_dir=ROOT,
            config_reader=StaticConfig(configured_faceted_studio()),
            provider=provider,
            reference_fetcher=reference_fetcher,
            storage_root=self.root / "faceted-artifacts",
        )
        queued = await manager.start_batch(
            owner_id="api_key:key-a",
            owner_credential_id="key-a",
            request_id="request:faceted:0001",
            name="Faceted mockup",
            selections=[{
                "product_id": "embroidered-hat",
                "source_ids": ["white"],
                "variation_ids": ["personalized-logo"],
            }],
            logo=logo_payload(),
        )
        await manager.wait(queued["jobs"][0]["job_id"])
        completed = manager.get_batch(
            owner_id="api_key:key-a", batch_id=queued["batch_id"]
        )
        self.assertEqual(completed["status"], "completed")
        self.assertEqual(provider.input_files, [
            "logo.png", "product-reference.png",
        ])
        self.assertIn("Image 1:", provider.prompt)
        self.assertIn("Image 2:", provider.prompt)
        self.assertNotIn("Imprint-location example:", provider.prompt)
        self.assertEqual(
            reference_fetcher.urls,
            ["https://assets.example/hat/white.png"],
        )

    async def test_active_batch_can_be_cancelled_then_deleted(self):
        provider = BlockingProvider()
        reference_fetcher = FakeReferenceFetcher()
        manager = PRODUCTS.ProductImageJobManager(
            engine=self.engine,
            batch_model=ImageBatch,
            job_model=ImageJob,
            project_dir=ROOT,
            config_reader=StaticConfig(configured_studio()),
            provider=provider,
            reference_fetcher=reference_fetcher,
            storage_root=self.root / "cancelled-batch-artifacts",
        )
        queued = await manager.start_batch(
            owner_id="api_key:key-a",
            owner_credential_id="key-a",
            request_id="request:batch:0002",
            name="Cancelled batch",
            selections=[{
                "product_id": "embroidered-hat",
                "source_ids": ["navy", "white"],
                "variation_ids": ["front-center"],
            }],
            logo=logo_payload(),
        )
        await asyncio.wait_for(provider.started.wait(), timeout=2)
        with self.assertRaises(PRODUCTS.ProductJobConflict):
            manager.delete_batch(
                owner_id="api_key:key-a", batch_id=queued["batch_id"]
            )
        cancelled = await manager.cancel_batch(
            owner_id="api_key:key-a", batch_id=queued["batch_id"]
        )
        self.assertEqual(cancelled["status"], "cancelled")
        self.assertEqual(cancelled["progress"]["cancelled"], 2)
        deleted = manager.delete_batch(
            owner_id="api_key:key-a", batch_id=queued["batch_id"]
        )
        self.assertEqual(deleted, {
            "deleted": True, "batch_id": queued["batch_id"],
        })
        with self.assertRaises(PRODUCTS.ProductJobNotFound):
            manager.get_batch(
                owner_id="api_key:key-a", batch_id=queued["batch_id"]
            )


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
            "POST /client/product-generation/batches", docs
        )
        self.assertIn(
            "DELETE /client/product-generation/batches/{batch_id}", docs
        )
        self.assertIn(
            "POST /product-generation/admin/test", docs
        )
        batch_schema = docs[
            "POST /client/product-generation/batches"
        ]["request_body"]["content"]["application/json"]["schema"]
        self.assertEqual(
            set(batch_schema["required"]),
            {"request_id", "selections", "logo"},
        )
        self.assertNotIn("aspect_id", batch_schema["properties"])
        self.assertNotIn("scene_id", batch_schema["properties"])
        self.assertNotIn("lighting_id", batch_schema["properties"])
        self.assertIn(
            "variation_ids",
            batch_schema["properties"]["selections"]["items"]["properties"],
        )
        self.assertIn(
            '@router.get("/client/product-generation/health")', routes
        )
        self.assertIn(
            '@router.get("/product-generation/references/{asset_path:path}")',
            routes,
        )
        self.assertIn(
            {
                "method": "GET",
                "path": (
                    "/projects/golfballs-extension/"
                    "product-generation/references/*"
                ),
            },
            manifest["public_routes"],
        )
        self.assertIn(
            '@router.get("/product-generation/admin/jobs")', routes
        )
        self.assertIn(
            '@router.get("/product-generation/admin/batches")', routes
        )
        self.assertIn('"product-image-jobs"', blocks)
        self.assertIn('"product-image-batches"', blocks)
        self.assertIn("product-image-test", blocks)
        registrations = {
            item.get("id"): item for item in package.get("tests", [])
        }
        self.assertIn("guard-product-image-jobs", registrations)


if __name__ == "__main__":
    unittest.main()
