"""Offline Golfballs catalog → managed mockup importer guards."""

import importlib.util
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "build_mockup_catalog.py"
SPEC = importlib.util.spec_from_file_location(
    "golfballs_mockup_catalog_import_test", MODULE_PATH
)
IMPORTER = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = IMPORTER
SPEC.loader.exec_module(IMPORTER)


def product_fixture(*, child_count=2):
    children = [
        {
            "AvailableForSale": True,
            "PropertyValueProduct": [
                {
                    "propertyProductID": 1,
                    "propertyValueProductID": 101 + index,
                    "Value": color,
                },
                {
                    "propertyProductID": 2,
                    "propertyValueProductID": 201,
                    "Value": "Medium",
                },
            ],
        }
        for index, color in enumerate(["Black", "Navy"][:child_count])
    ]
    children.append({
        "AvailableForSale": False,
        "PropertyValueProduct": [
            {
                "propertyProductID": 1,
                "propertyValueProductID": 103,
                "Value": "Stale Red",
            },
        ],
    })
    return {
        "ShortCode": "PTEST1",
        "PropertyProduct": [
            {
                "propertyProductID": 1,
                "Name": "Color",
                "PropertyValueProduct": [
                    {"propertyValueProductID": 101, "Value": "Black"},
                    {"propertyValueProductID": 102, "Value": "Navy"},
                    {"propertyValueProductID": 103, "Value": "Stale Red"},
                ],
            },
            {
                "propertyProductID": 2,
                "Name": "Size",
                "PropertyValueProduct": [
                    {"propertyValueProductID": 201, "Value": "Medium"},
                ],
            },
        ],
        "ProductChild": children,
        "ProductImage": [
            {
                "URL": "default.webp",
                "PropertyValueProduct": [],
                "ProductImageConditionSpecial": [
                    {"VisibleOnNoSelections": True},
                ],
            },
            {
                "URL": "black.webp",
                "PropertyValueProduct": [
                    {"propertyValueProductID": 101},
                ],
                "ProductImageConditionSpecial": [],
            },
            {
                "URL": "navy.webp",
                "PropertyValueProduct": [
                    {"propertyValueProductID": 102},
                ],
                "ProductImageConditionSpecial": [],
            },
        ],
    }


class ProductPlanTests(unittest.TestCase):
    def test_registers_exactly_45_additional_non_ball_products(self):
        self.assertEqual(len(IMPORTER.PLANS), 45)
        indexes = [plan.index for plan in IMPORTER.PLANS]
        self.assertEqual(len(indexes), len(set(indexes)))
        self.assertTrue({45, 46}.isdisjoint(indexes))

    def test_does_not_regenerate_the_five_manually_audited_products(self):
        indexes = {plan.index for plan in IMPORTER.PLANS}
        self.assertTrue({2, 3, 7, 23, 56}.isdisjoint(indexes))

    def test_every_product_declares_a_supported_material_profile(self):
        for plan in IMPORTER.PLANS:
            with self.subTest(index=plan.index):
                self.assertIn(plan.profile, IMPORTER.PROFILE_COPY)
                x1, y1, x2, y2 = plan.box
                self.assertTrue(0 <= x1 < x2 <= 800)
                self.assertTrue(0 <= y1 < y2 <= 800)


class CurrentVariantTests(unittest.TestCase):
    def test_only_current_visual_values_become_sources(self):
        combos = IMPORTER.available_combinations(
            product_fixture(), ("Color",)
        )
        self.assertEqual(combos, [{"Color": "Black"}, {"Color": "Navy"}])

    def test_size_is_not_multiplied_into_visual_sources(self):
        combos = IMPORTER.available_combinations(
            product_fixture(), ("Color",)
        )
        self.assertEqual(len(combos), 2)
        self.assertNotIn("Size", combos[0])

    def test_refuses_to_silently_truncate_more_than_50_sources(self):
        fixture = product_fixture(child_count=0)
        fixture["ProductChild"] = [
            {
                "AvailableForSale": True,
                "PropertyValueProduct": [
                    {
                        "propertyProductID": 1,
                        "propertyValueProductID": 500 + index,
                        "Value": f"Color {index}",
                    },
                ],
            }
            for index in range(51)
        ]
        with self.assertRaisesRegex(ValueError, "schema cap is 50"):
            IMPORTER.available_combinations(fixture, ("Color",))

    def test_uses_the_exact_variant_image_before_the_default(self):
        fixture = product_fixture()
        self.assertEqual(
            IMPORTER.choose_product_image(fixture, {"Color": "Navy"}),
            "navy.webp",
        )

    def test_falls_back_to_the_default_for_an_unmapped_visual_value(self):
        fixture = product_fixture()
        self.assertEqual(
            IMPORTER.choose_product_image(fixture, {"Color": "Unknown"}),
            "default.webp",
        )


class PromptTests(unittest.TestCase):
    def test_material_profiles_produce_distinct_physical_directions(self):
        embroidery = IMPORTER.product_prompt("embroidery")
        engraving = IMPORTER.product_prompt("engraving")
        printed = IMPORTER.product_prompt("printed")
        self.assertIn("stitched", embroidery)
        self.assertIn("recessed", engraving)
        self.assertIn("full-color imprint", printed)
        for prompt in (embroidery, engraving, printed):
            self.assertIn("change nothing outside", prompt.lower())
            self.assertIn("magenta", prompt.lower())


if __name__ == "__main__":
    unittest.main()
