"""Managed mockup catalog authoring — validation, schema link, and rendering.

The Mockup Studio re-reads the managed catalog document on EVERY request, so a
bad authoring write is visible to every installation immediately. These pin the
three things that keep that safe:

  * validate_document runs a candidate through the same normalizer as load(),
    so the authoring surface can never accept what the studio would reject;
  * the optional catalog_sku / catalog_id back-link is accepted and exposed
    while the product key set stays closed to everything else;
  * the write path re-renders ONLY the products list, preserving the document's
    explanatory header, schema_version, and constraints byte for byte
    (PyYAML cannot round-trip comments and ruamel is not installed).
"""

import copy
import importlib.util
import re
import sys
import unittest
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / ".revstack" / "logic" / "product_generation.py"
SPEC = importlib.util.spec_from_file_location(
    "golfballs_mockup_catalog_test", MODULE_PATH
)
PRODUCTS = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = PRODUCTS
SPEC.loader.exec_module(PRODUCTS)

REF = (
    "https://api.cullenchampagne.com/projects/golfballs-extension"
    "/product-generation/references/towel"
)

# Mirrors routes.py: everything above `products:` is preserved verbatim.
# Anchored at column 0 only, NOT to end of line — an empty document writes
# `products: []` inline and must still split correctly.
PRODUCTS_KEY = re.compile(r"^products:", re.MULTILINE)


def registry():
    """The catalog normalizer without its config reader — validation is pure."""
    return PRODUCTS.ProductPromptRegistry.__new__(PRODUCTS.ProductPromptRegistry)


def catalog_preamble(source):
    match = PRODUCTS_KEY.search(source or "")
    return source[: match.start()] if match else ""


def render_document(preamble, products):
    body = yaml.safe_dump(
        {"products": products},
        sort_keys=False, allow_unicode=True, width=78, default_flow_style=False,
    )
    if not preamble.endswith("\n"):
        preamble += "\n"
    return f"{preamble}{body}"


def product(**overrides):
    """A faceted product shaped exactly like the authoring surface emits."""
    row = {
        "id": "venture-towel",
        "title": "Venture Golf Microfiber Magnetic Towel",
        "brand": "Venture Golf",
        "category": "Golf Towels",
        "display_image_url": f"{REF}/studio-black.png",
        "enabled": True,
        "sort": 10,
        "prompt_version": "venture-towel-v1",
        "prompt": "Edit Image 1 by placing the logo from Image 2 in the marked area.",
        "option_groups": [
            {
                "id": "scene", "label": "Scene", "presentation": "thumbnail",
                "columns": 2,
                "options": [
                    {"id": "studio", "label": "Studio"},
                    {"id": "grass", "label": "Golf course"},
                ],
            },
            {
                "id": "color", "label": "Color", "presentation": "swatch",
                "columns": 3,
                "options": [
                    {"id": "black", "label": "Black", "swatch": "#17191b"},
                    {"id": "white", "label": "White", "swatch": "#f4f3ee"},
                ],
            },
        ],
        "sources": [
            {
                "id": "studio-black", "label": "Studio · Black",
                "option_values": {"scene": "studio", "color": "black"},
                "reference_image_url": f"{REF}/studio-black.png",
                "thumbnail_url": f"{REF}/studio-black.png",
            },
            {
                "id": "studio-white", "label": "Studio · White",
                "option_values": {"scene": "studio", "color": "white"},
                "reference_image_url": f"{REF}/studio-white.png",
                "thumbnail_url": f"{REF}/studio-white.png",
            },
            # grass/white deliberately absent — the grid is sparse.
            {
                "id": "grass-black", "label": "Golf course · Black",
                "option_values": {"scene": "grass", "color": "black"},
                "reference_image_url": f"{REF}/grass-black.png",
                "thumbnail_url": f"{REF}/grass-black.png",
            },
        ],
        "variations": [
            {"id": "personalized-logo", "label": "Personalized logo", "prompt": ""},
        ],
    }
    row.update(overrides)
    return row


def document(**overrides):
    return {
        "schema_version": 3,
        "constraints": {"max_products": 5, "max_images": 20},
        "products": [product(**overrides)],
    }


class ValidateDocumentTests(unittest.TestCase):
    """validate_document must accept exactly what load() would."""

    def test_accepts_a_faceted_product(self):
        self.assertEqual(registry().validate_document(document()), 1)

    def test_accepts_a_sparse_combination_grid(self):
        """A 2x2 grid with 3 sources is normal — the shipped towel is sparse."""
        _, _, products = registry()._normalize_v3(document())
        self.assertEqual(len(products["venture-towel"]["sources"]), 3)

    def test_rejects_a_source_that_misses_an_option_group(self):
        broken = document()
        del broken["products"][0]["sources"][0]["option_values"]["color"]
        with self.assertRaises(PRODUCTS.ProductConfigurationError):
            registry().validate_document(broken)

    def test_rejects_a_duplicate_combination(self):
        broken = document()
        broken["products"][0]["sources"][1]["option_values"] = {
            "scene": "studio", "color": "black",
        }
        with self.assertRaises(PRODUCTS.ProductConfigurationError) as caught:
            registry().validate_document(broken)
        self.assertIn("duplicate option combinations", str(caught.exception))

    def test_rejects_a_source_without_a_reference_image(self):
        broken = document()
        broken["products"][0]["sources"][0]["reference_image_url"] = ""
        with self.assertRaises(PRODUCTS.ProductConfigurationError):
            registry().validate_document(broken)

    def test_rejects_a_non_https_reference(self):
        broken = document()
        broken["products"][0]["sources"][0]["reference_image_url"] = (
            "http://example.com/x.png"
        )
        with self.assertRaises(PRODUCTS.ProductConfigurationError):
            registry().validate_document(broken)

    def test_rejects_a_short_product_prompt(self):
        with self.assertRaises(PRODUCTS.ProductConfigurationError):
            registry().validate_document(document(prompt="too short"))

    def test_rejects_an_unknown_schema_version(self):
        broken = document()
        broken["schema_version"] = 2
        with self.assertRaises(PRODUCTS.ProductConfigurationError):
            registry().validate_document(broken)

    def test_rejects_a_non_mapping_document(self):
        for candidate in ([], "products", None, 3):
            with self.assertRaises(PRODUCTS.ProductConfigurationError):
                registry().validate_document(candidate)


class OptionPromptCompositionTests(unittest.TestCase):
    """A trait is described once, on the layer that owns it, then composed.

    Before per-option prompts existed, a scene ("worn by a person") had to be
    repeated in every colour cell that used it. These pin that an option prompt
    is authored once, reaches the render direction labelled by its group, and
    never leaks to the client.
    """

    PRODUCT = {
        "option_groups": [
            {
                "id": "scene", "label": "Scene",
                "options": [
                    {"id": "model", "label": "On a model",
                     "prompt": "Show the polo worn by a person."},
                    {"id": "flat", "label": "Flat studio",
                     "prompt": "Lay the polo flat on seamless white."},
                ],
            },
            {
                "id": "color", "label": "Color",
                "options": [
                    {"id": "navy", "label": "Navy",
                     "prompt": "Preserve the exact navy dye."},
                    {"id": "white", "label": "White", "prompt": ""},
                ],
            },
        ],
    }
    VARIATION = {"id": "left-chest", "label": "Left chest",
                 "prompt": "Embroider at the left chest."}
    ASPECT = {"prompt": "Compose for a square 1:1 frame."}

    def direction(self, values, source_prompt=""):
        source = {
            "id": "s", "label": "Selected", "option_values": values,
            "prompt": source_prompt,
        }
        return PRODUCTS._selection_direction(
            self.PRODUCT, source, self.VARIATION, self.ASPECT
        )

    def test_a_scene_prompt_reaches_every_colour_that_selects_it(self):
        navy = self.direction({"scene": "model", "color": "navy"})
        white = self.direction({"scene": "model", "color": "white"})
        for text in (navy, white):
            self.assertIn("Show the polo worn by a person.", text)
        self.assertIn("Preserve the exact navy dye.", navy)
        self.assertNotIn("Preserve the exact navy dye.", white)

    def test_each_line_is_labelled_by_its_group_and_option(self):
        text = self.direction({"scene": "model", "color": "navy"})
        self.assertIn("Scene — On a model:", text)
        self.assertIn("Color — Navy:", text)
        self.assertIn("Placement — Left chest:", text)

    def test_a_different_scene_swaps_only_the_scene_line(self):
        text = self.direction({"scene": "flat", "color": "navy"})
        self.assertIn("Lay the polo flat on seamless white.", text)
        self.assertNotIn("worn by a person", text)
        self.assertIn("Preserve the exact navy dye.", text)

    def test_options_compose_before_the_narrower_source_prompt(self):
        text = self.direction(
            {"scene": "model", "color": "navy"}, source_prompt="One-off note."
        )
        self.assertLess(
            text.index("worn by a person"), text.index("One-off note."),
            "general direction must be read before the narrower override",
        )

    def test_placement_and_aspect_still_compose_last(self):
        text = self.direction({"scene": "flat", "color": "white"})
        self.assertLess(
            text.index("Embroider at the left chest."),
            text.index("Compose for a square 1:1 frame."),
        )

    def test_an_empty_option_prompt_contributes_no_line(self):
        text = self.direction({"scene": "flat", "color": "white"})
        self.assertNotIn("Color — White", text)

    def test_a_product_without_option_groups_still_composes(self):
        text = PRODUCTS._selection_direction(
            {}, {"id": "s", "label": "S", "prompt": "Only note."},
            self.VARIATION, self.ASPECT,
        )
        self.assertIn("Only note.", text)
        self.assertIn("Embroider at the left chest.", text)

    def test_the_normalizer_accepts_and_keeps_an_option_prompt(self):
        doc = document()
        doc["products"][0]["option_groups"][0]["options"][0]["prompt"] = (
            "Show the towel on a clean studio background."
        )
        _, _, products = registry()._normalize_v3(doc)
        group = products["venture-towel"]["option_groups"][0]
        self.assertEqual(
            group["options"][0]["prompt"],
            "Show the towel on a clean studio background.",
        )
        self.assertEqual(group["options"][1]["prompt"], "",
                         "an unset option prompt normalizes to empty")

    def test_an_over_long_option_prompt_is_rejected(self):
        doc = document()
        doc["products"][0]["option_groups"][0]["options"][0]["prompt"] = "x" * 2_001
        with self.assertRaises(PRODUCTS.ProductConfigurationError):
            registry().validate_document(doc)


class CatalogLinkTests(unittest.TestCase):
    """The corporate-catalog back-link is optional but must survive."""

    def test_accepts_and_exposes_the_catalog_link(self):
        doc = document(catalog_sku="M6594", catalog_id="5241-venture-towel")
        _, _, products = registry()._normalize_v3(doc)
        row = products["venture-towel"]
        self.assertEqual(row["catalog_sku"], "M6594")
        self.assertEqual(row["catalog_id"], "5241-venture-towel")

    def test_an_unlinked_product_reports_empty_strings(self):
        _, _, products = registry()._normalize_v3(document())
        row = products["venture-towel"]
        self.assertEqual(row["catalog_sku"], "")
        self.assertEqual(row["catalog_id"], "")

    def test_the_product_key_set_stays_closed(self):
        broken = document()
        broken["products"][0]["catalog_notes"] = "not a registered key"
        with self.assertRaises(PRODUCTS.ProductConfigurationError):
            registry().validate_document(broken)


class DocumentRenderTests(unittest.TestCase):
    """The write path must preserve everything above `products:`."""

    def setUp(self):
        self.source = (
            ROOT.parent / "api-access-configs" / "golfballs-image-generation.yaml"
        )

    def test_preserves_the_header_schema_and_constraints(self):
        if not self.source.is_file():
            self.skipTest("managed catalog is local-only")
        original = self.source.read_text()
        parsed = yaml.safe_load(original)
        rendered = render_document(catalog_preamble(original), parsed["products"])
        reparsed = yaml.safe_load(rendered)

        self.assertEqual(reparsed["schema_version"], parsed["schema_version"])
        self.assertEqual(reparsed["constraints"], parsed["constraints"])
        self.assertEqual(reparsed["products"], parsed["products"])
        kept = [
            line for line in catalog_preamble(original).splitlines()
            if line.strip().startswith("#")
        ]
        self.assertGreater(len(kept), 10, "the explanatory header must survive")

    def test_a_rendered_document_still_validates(self):
        if not self.source.is_file():
            self.skipTest("managed catalog is local-only")
        original = self.source.read_text()
        parsed = yaml.safe_load(original)
        rendered = render_document(catalog_preamble(original), parsed["products"])
        self.assertGreaterEqual(
            registry().validate_document(yaml.safe_load(rendered)), 1
        )

    def test_an_added_product_renders_and_validates(self):
        original = (
            "# header comment\nschema_version: 3\n\n"
            "constraints:\n  max_products: 5\n  max_images: 20\n\nproducts: []\n"
        )
        rendered = render_document(catalog_preamble(original), [product()])
        reparsed = yaml.safe_load(rendered)
        self.assertIn("# header comment", rendered)
        self.assertEqual(reparsed["constraints"]["max_products"], 5)
        self.assertEqual(registry().validate_document(reparsed), 1)

    def test_an_inline_empty_products_list_still_splits(self):
        """`products: []` is the bootstrap shape; missing it would drop the
        real header and silently revert customized constraints."""
        original = (
            "# managed header\nschema_version: 3\n\n"
            "constraints:\n  max_products: 8\n  max_images: 30\n\nproducts: []\n"
        )
        preamble = catalog_preamble(original)
        self.assertIn("# managed header", preamble)
        rendered = render_document(preamble, [product()])
        reparsed = yaml.safe_load(rendered)
        self.assertEqual(reparsed["constraints"]["max_products"], 8,
                         "customized constraints must survive the first save")
        self.assertEqual(reparsed["constraints"]["max_images"], 30)
        self.assertEqual(registry().validate_document(reparsed), 1)

    def test_an_indented_products_key_is_not_mistaken_for_the_root_key(self):
        original = (
            "schema_version: 3\n\nconstraints:\n  max_products: 5\n"
            "  max_images: 20\n\nproducts: []\n"
        )
        self.assertIn("max_products: 5", catalog_preamble(original),
                      "the indented max_products key must not split the document")

    def test_a_rejected_draft_never_reaches_a_rendered_document(self):
        """Validation happens on the rendered text, not the caller's object."""
        broken = copy.deepcopy(product())
        broken["prompt"] = "short"
        rendered = render_document("schema_version: 3\nconstraints:\n"
                                   "  max_products: 5\n  max_images: 20\n", [broken])
        with self.assertRaises(PRODUCTS.ProductConfigurationError):
            registry().validate_document(yaml.safe_load(rendered))


if __name__ == "__main__":
    unittest.main()
