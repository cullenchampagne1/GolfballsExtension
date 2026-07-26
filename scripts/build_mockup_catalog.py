#!/usr/bin/env python3
"""Build managed mockup products from a local Golfballs catalog export.

The browser export is intentionally the only network boundary. This importer
reads the saved Next.js product documents and downloaded gallery images,
filters to currently purchasable child combinations, creates square placement
references, and emits schema-v3 catalog products. It never fetches the site.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

import yaml


API_REFERENCE_BASE = (
    "https://api.cullenchampagne.com/projects/golfballs-extension/"
    "product-generation/references"
)
NEXT_DATA = re.compile(
    r'<script id="__NEXT_DATA__" type="application/json">([\s\S]*?)</script>'
)
PRODUCTS_KEY = re.compile(r"^products:", re.MULTILINE)
COLOR_WORDS = (
    "color", "colour", "finish", "tone",
)
NON_VISUAL_WORDS = (
    "size", "quantity", "pack", "imprint color", "# of colors",
)


@dataclass(frozen=True)
class ProductPlan:
    index: int
    axes: tuple[str, ...]
    profile: str
    placement_id: str
    placement_label: str
    placement_description: str


# These 45 products plus the five already-authored products make a 50-product
# managed catalog. Golf balls are deliberately absent; the extension's 3D ball
# renderer owns that workflow.
PLANS = (
    ProductPlan(4, ("Apparel Color",), "embroidery", "front-center", "Front center", "Embroidery centered on the front crown."),
    ProductPlan(5, (), "printed", "ball-marker", "Ball marker", "Full-color logo on the removable glove ball marker."),
    ProductPlan(6, (), "printed", "ball-marker", "Ball marker", "Full-color logo on the removable glove ball marker."),
    ProductPlan(8, ("Color",), "embroidery", "front-center", "Front center", "Embroidery centered on the visor front."),
    ProductPlan(9, ("Color",), "embroidery", "front-center", "Front center", "Embroidery centered on the beanie front."),
    ProductPlan(10, ("Apparel Color",), "embroidery", "front-center", "Front center", "Embroidery centered on the hat front."),
    ProductPlan(11, ("Apparel Color",), "embroidery", "front-center", "Front center", "Embroidery centered on the junior hat front."),
    ProductPlan(12, ("Apparel Color",), "embroidery", "left-chest", "Left chest", "Embroidery on the wearer's left chest."),
    ProductPlan(13, ("Color",), "embroidery", "left-chest", "Left chest", "Embroidery on the wearer's left chest."),
    ProductPlan(14, ("Apparel Color",), "embroidery", "left-chest", "Left chest", "Embroidery on the wearer's left chest."),
    ProductPlan(15, ("Color",), "embroidery", "left-chest", "Left chest", "Embroidery on the wearer's left chest."),
    ProductPlan(16, ("Apparel Color",), "embroidery", "left-chest", "Left chest", "Embroidery on the wearer's left chest."),
    ProductPlan(17, ("Apparel Color",), "embroidery", "left-chest", "Left chest", "Embroidery on the wearer's left chest."),
    ProductPlan(18, ("Apparel Color",), "embroidery", "left-chest", "Left chest", "Embroidery on the wearer's left chest."),
    ProductPlan(19, ("Apparel Color",), "embroidery", "left-chest", "Left chest", "Embroidery on the wearer's left chest."),
    ProductPlan(20, ("Apparel Color",), "embroidery", "left-chest", "Left chest", "Embroidery on the wearer's left chest."),
    ProductPlan(21, ("Apparel Color",), "embroidery", "left-chest", "Left chest", "Embroidery on the wearer's left chest."),
    ProductPlan(22, ("Apparel Color",), "printed", "left-chest", "Left chest", "Transfer centered on the wearer's left chest."),
    ProductPlan(24, ("Apparel Color",), "embroidery", "left-chest", "Left chest", "Embroidery on the wearer's left chest."),
    ProductPlan(25, ("Color",), "printed", "center-chest", "Center chest", "Full-color transfer centered on the chest."),
    ProductPlan(27, ("Apparel Color",), "printed", "center-chest", "Center chest", "Full-color transfer centered on the chest."),
    ProductPlan(28, (), "knit", "outer-ankle", "Outer ankle", "Logo integrated into the visible outer ankle panel."),
    ProductPlan(29, ("Color",), "printed", "center-face", "Center face", "Full-color personalization centered on the marker face."),
    ProductPlan(31, ("Color",), "printed", "center-face", "Center face", "Full-color personalization centered on the poker-chip face."),
    ProductPlan(32, (), "printed", "box-top", "Box top", "Full-color decoration centered on the visible custom packaging top."),
    ProductPlan(33, ("Color",), "engraving", "lid-center", "Lid center", "Deep engraving centered on the keepsake-box lid."),
    ProductPlan(36, ("Accessories Color",), "printed", "marker-face", "Marker face", "Full-color personalization centered on the gift-set marker."),
    ProductPlan(37, ("Color",), "printed", "handle", "Handle", "Logo centered on the retriever handle."),
    ProductPlan(38, ("Golf Bags Color",), "embroidery", "front-pocket", "Front pocket", "Embroidery centered on the visible front pocket."),
    ProductPlan(39, ("Color",), "embroidery", "side-panel", "Side panel", "Embroidery centered on the duffel side panel."),
    ProductPlan(40, ("Accessories Color",), "embroidery", "front-panel", "Front panel", "Embroidery centered on the headcover front panel."),
    ProductPlan(41, (), "embroidery", "side-panel", "Side panel", "Embroidery centered on the shoe-bag side panel."),
    ProductPlan(42, ("Golf Bags Color",), "embroidery", "side-pocket", "Side pocket", "Embroidery centered on the visible side pocket."),
    ProductPlan(43, ("Color",), "embroidery", "front-pocket", "Front pocket", "Embroidery centered on the visible front pocket."),
    ProductPlan(44, ("Golf Bags Color",), "embroidery", "front-panel", "Front panel", "Embroidery centered on the travel-bag front panel."),
    ProductPlan(48, ("Accessories Color",), "printed", "side-panel", "Side panel", "Logo centered on the visible rangefinder side panel."),
    ProductPlan(49, ("Accessories Color",), "printed", "center-face", "Center face", "Full-color logo centered on the alignment-chip face."),
    ProductPlan(50, ("Color",), "printed", "canopy-valance", "Canopy valance", "Full-color logo centered on the visible canopy valance."),
    ProductPlan(51, ("Accessories Color",), "printed", "brush-handle", "Brush handle", "Logo centered on the visible brush handle."),
    ProductPlan(53, ("Color",), "printed", "blanket-center", "Blanket center", "Full-color decoration centered on the visible blanket panel."),
    ProductPlan(54, ("Accessories Color",), "embroidery", "front-pocket", "Front pocket", "Embroidery centered on the cooler's front pocket."),
    ProductPlan(57, ("Color",), "engraving", "center-front", "Center front", "Laser engraving centered on the flask front."),
    ProductPlan(58, ("Color",), "engraving", "top-face", "Top face", "Laser engraving centered on the hub's top face."),
    ProductPlan(59, ("Accessories Color",), "printed", "upright-panel", "Upright panel", "Logo centered on the charging station's upright panel."),
    ProductPlan(60, ("Accessories Color",), "printed", "end-cap", "End cap", "Logo centered on the visible speaker end cap."),
)


PROFILE_COPY = {
    "embroidery": (
        "Render the supplied logo as realistic multicolor embroidery stitched "
        "directly into the product, with fine thread texture, subtle raised "
        "stitches, natural highlights and shadows, and slight interaction with "
        "the material's weave, folds, and curvature. It must look sewn in, not "
        "printed, pasted, or floating."
    ),
    "printed": (
        "Render the supplied logo as a clean, production-realistic full-color "
        "imprint bonded to the product surface, following its texture, folds, "
        "perspective, and curvature. Preserve fine artwork detail without "
        "making it look pasted on, embossed, or floating."
    ),
    "engraving": (
        "Render the supplied logo as a precise single-tone engraving cut into "
        "the product surface, with physically plausible recessed detail, edge "
        "highlights, material interaction, perspective, and curvature. It must "
        "look engraved, not printed, pasted, embossed above, or floating."
    ),
    "knit": (
        "Render the supplied logo as a production-realistic woven or knitted "
        "decoration integrated into the textile structure, following the sock "
        "stretch, ribbing, folds, and perspective. It must not look pasted on "
        "or floating."
    ),
}

COMMON_SWATCHES = {
    "black": "#17191c", "white": "#f4f4f1", "navy": "#172947",
    "red": "#c72d3c", "blue": "#245a9c", "royal": "#1d52a3",
    "green": "#23543b", "dark green": "#174637", "gray": "#777b7e",
    "grey": "#777b7e", "charcoal": "#505255", "silver": "#bfc1c2",
    "gold": "#c39a4e", "yellow": "#e3c52e", "orange": "#d9682d",
    "purple": "#644789", "pink": "#d7869e", "maroon": "#702f3b",
    "brown": "#6d4b34", "tan": "#b9a17f", "stone": "#c5b9a0",
}


def slug(value: Any, fallback: str = "option") -> str:
    text = re.sub(r"[^a-z0-9]+", "-", str(value or "").strip().lower())
    return text.strip("-")[:80] or fallback


def clean_category(value: str) -> str:
    leaf = str(value or "").split("-")[-1].replace("_", " ").strip()
    return re.sub(r"\s+", " ", leaf).title() or "Promotional Products"


def product_brand(product: dict, catalog_row: dict) -> str:
    brand = product.get("Brand")
    if isinstance(brand, dict):
        for key in ("Name", "name"):
            if brand.get(key):
                return str(brand[key]).strip()
    return str(catalog_row.get("brand_s") or "Golfballs.com").strip()


def read_product(page: Path) -> dict:
    match = NEXT_DATA.search(page.read_text(errors="replace"))
    if not match:
        raise ValueError(f"{page.name} does not contain __NEXT_DATA__")
    return json.loads(match.group(1))["props"]["pageProps"]["product"]


def available_combinations(product: dict, axes: tuple[str, ...]) -> list[dict]:
    if not axes:
        return [{}]
    properties = {
        row["propertyProductID"]: row["Name"]
        for row in product.get("PropertyProduct", [])
    }
    combos: dict[tuple[str, ...], dict] = {}
    for child in product.get("ProductChild", []):
        if child.get("AvailableForSale") is not True:
            continue
        values = {
            properties.get(value.get("propertyProductID")): str(
                value.get("Value") or ""
            ).strip()
            for value in child.get("PropertyValueProduct", [])
        }
        if any(not values.get(axis) for axis in axes):
            continue
        key = tuple(values[axis] for axis in axes)
        combo = combos.setdefault(
            key,
            {
                axis: values[axis] for axis in axes
            },
        )
        combo["_children"] = combo.get("_children", 0) + 1
    rows = [
        {key: value for key, value in combo.items() if not key.startswith("_")}
        for combo in combos.values()
    ]
    if not rows:
        raise ValueError(
            f"{product.get('ShortCode')} has no purchasable combinations for {axes}"
        )
    if len(rows) > 50:
        raise ValueError(
            f"{product.get('ShortCode')} needs {len(rows)} sources; schema cap is 50"
        )
    return rows


def image_value_names(product: dict) -> dict[int, str]:
    values = {}
    for prop in product.get("PropertyProduct", []):
        for row in prop.get("PropertyValueProduct", []):
            values[row["propertyValueProductID"]] = str(row.get("Value") or "")
    return values


def choose_product_image(product: dict, combo: dict) -> str:
    names = image_value_names(product)
    property_names = {
        row["propertyProductID"]: row["Name"]
        for row in product.get("PropertyProduct", [])
    }
    ranked = []
    fallback = []
    for index, image in enumerate(product.get("ProductImage", [])):
        url = str(image.get("URL") or "").strip()
        if not url:
            continue
        attached = {
            names.get(value.get("propertyValueProductID"), "")
            for value in image.get("PropertyValueProduct", [])
        }
        wildcard_axes = {
            property_names.get(condition.get("propertyProductID"), "")
            for condition in image.get("ProductImageConditionSpecial", [])
            if condition.get("VisibleOnAllSelections")
        }
        if combo and all(
            value in attached or axis in wildcard_axes
            for axis, value in combo.items()
        ):
            wildcard_count = sum(
                value not in attached for axis, value in combo.items()
            )
            ranked.append((
                wildcard_count,
                max(0, len(attached) - (len(combo) - wildcard_count)),
                index,
                url,
            ))
        if any(
            condition.get("VisibleOnNoSelections")
            for condition in image.get("ProductImageConditionSpecial", [])
        ):
            fallback.append((index, url))
    if ranked:
        return min(ranked)[3]
    if fallback:
        return min(fallback)[1]
    images = product.get("ProductImage", [])
    return str(images[0].get("URL") or "") if images else ""


def normalized_url_path(value: str) -> str:
    path = unquote(urlparse(value).path).lower()
    marker = "/800x800/"
    return path.split(marker, 1)[-1].lstrip("/")


def downloaded_image(index_row: dict, product_image_url: str, root: Path) -> Path:
    wanted = normalized_url_path(product_image_url)
    files = [
        row for row in index_row.get("imageFiles", [])
        if row.get("status") == 200
    ]
    for row in files:
        if normalized_url_path(str(row.get("url") or "")) == wanted:
            return root / row["file"]
    if not files:
        raise FileNotFoundError(
            f"{index_row.get('sku')} has no downloaded product image"
        )
    return root / files[0]["file"]


def swatch_for(label: str, combo_children: list[dict], axis: str) -> str:
    for child in combo_children:
        values = {str(row.get("Value") or ""): row for row in child.get("PropertyValueProduct", [])}
        if label not in values:
            continue
        custom = child.get("CustomData") or {}
        candidate = str(custom.get("backgroundHex") or "").strip()
        if re.fullmatch(r"#[0-9a-fA-F]{6}", candidate):
            return candidate
    lowered = label.lower()
    for name, value in COMMON_SWATCHES.items():
        if name in lowered:
            return value
    return ""


def make_reference(source: Path, destination: Path):
    destination.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "magick", str(source), "-auto-orient", "-resize", "800x800",
            "-background", "white", "-gravity", "center", "-extent", "800x800",
            str(destination),
        ],
        check=True,
        capture_output=True,
        text=True,
    )


def product_prompt(profile: str) -> str:
    return (
        "Edit Image 1 by replacing only its existing custom logo, sample "
        "personalization, or decoration at the registered imprint location "
        "with the exact logo from Image 2. If no personalization is visible, "
        "use the registered imprint-location instruction to identify the "
        "decoration surface. Preserve every other part of Image 1 exactly, "
        "including the product's shape, construction, material, color, branded "
        "details, texture, folds, lighting, reflections, shadows, background, "
        "crop, perspective, and resolution. Preserve the supplied logo's exact "
        "spelling, colors, geometry, proportions, and internal layout; do not "
        "redesign, simplify, restyle, or add anything. Center and scale it "
        "proportionally with comfortable margins. "
        f"{PROFILE_COPY[profile]} Remove the original custom or sample "
        "personalization completely, but preserve permanent manufacturer "
        "branding. Change nothing outside the decoration surface. Output one "
        "finished square product image matching Image 1."
    )


def build_product(
    plan: ProductPlan,
    catalog_row: dict,
    index_row: dict,
    product: dict,
    export_root: Path,
    reference_root: Path,
    sort: int,
) -> tuple[dict, dict]:
    product_id = slug(product.get("Name") or catalog_row.get("title_s"))
    combinations = available_combinations(product, plan.axes)
    properties = {
        row["Name"]: row for row in product.get("PropertyProduct", [])
    }
    child_rows = [
        row for row in product.get("ProductChild", [])
        if row.get("AvailableForSale") is True
    ]
    option_ids: dict[str, dict[str, str]] = {}
    groups = []
    for axis in plan.axes:
        labels = []
        for combo in combinations:
            if combo[axis] not in labels:
                labels.append(combo[axis])
        ids = {}
        used = set()
        options = []
        for label in labels:
            option_id = slug(label)
            base = option_id
            suffix = 2
            while option_id in used:
                option_id = f"{base}-{suffix}"
                suffix += 1
            used.add(option_id)
            ids[label] = option_id
            option = {"id": option_id, "label": label}
            if any(word in axis.lower() for word in COLOR_WORDS):
                swatch = swatch_for(label, child_rows, axis)
                if swatch:
                    option["swatch"] = swatch
            options.append(option)
        option_ids[axis] = ids
        presentation = (
            "swatch"
            if any(word in axis.lower() for word in COLOR_WORDS)
            else "button"
        )
        groups.append({
            "id": slug(axis),
            "label": axis,
            "presentation": presentation,
            "columns": min(4, max(2, len(options))),
            "options": options,
        })

    sources = []
    report_sources = []
    used_source_ids = set()
    for combo in combinations:
        labels = [combo[axis] for axis in plan.axes]
        source_id = slug("-".join(labels) if labels else "standard")
        base = source_id
        suffix = 2
        while source_id in used_source_ids:
            source_id = f"{base}-{suffix}"
            suffix += 1
        used_source_ids.add(source_id)
        image_url = choose_product_image(product, combo)
        downloaded = downloaded_image(index_row, image_url, export_root)
        destination = reference_root / product_id / f"{source_id}.png"
        make_reference(downloaded, destination)
        served_url = f"{API_REFERENCE_BASE}/{product_id}/{source_id}.png"
        source = {
            "id": source_id,
            "label": " · ".join(labels) if labels else "Standard",
            "reference_image_url": served_url,
            "thumbnail_url": served_url,
        }
        if plan.axes:
            source["option_values"] = {
                slug(axis): option_ids[axis][combo[axis]]
                for axis in plan.axes
            }
        sources.append(source)
        report_sources.append({
            "id": source_id,
            "selection": combo,
            "productImage": image_url,
            "downloadedFile": str(downloaded.relative_to(export_root)),
            "referenceFile": str(destination),
        })

    custom_data = catalog_row.get("customData_s") or "{}"
    try:
        catalog_data = json.loads(custom_data)
    except json.JSONDecodeError:
        catalog_data = {}
    category_source = (
        product.get("ItemType", {}).get("Name")
        if isinstance(product.get("ItemType"), dict)
        else catalog_row.get("itemType_s")
    )
    row = {
        "id": product_id,
        "title": str(product.get("Name") or catalog_row.get("title_s") or "").strip(),
        "brand": product_brand(product, catalog_row),
        "category": clean_category(category_source),
        "description": (
            f"{plan.placement_description} Includes every currently purchasable "
            "visual option from the exported product page."
        ),
        "display_image_url": sources[0]["reference_image_url"],
        "catalog_sku": str(
            catalog_data.get("parentSku") or product.get("ManufacturerSku") or ""
        ).strip(),
        "catalog_id": str(
            product.get("ShortCode") or catalog_row.get("parentCode_s") or ""
        ).strip(),
        "enabled": True,
        "sort": sort,
        "prompt_version": f"{product_id}-v1",
        "prompt": product_prompt(plan.profile),
    }
    if groups:
        row["option_groups"] = groups
    row["sources"] = sources
    row["variations"] = [{
        "id": plan.placement_id,
        "label": plan.placement_label,
        "description": plan.placement_description,
        "prompt": (
            f"{plan.placement_description} Keep the finished decoration centered, "
            "level with the product, and comfortably inside the marked area."
        ),
    }]
    return row, {
        "index": plan.index,
        "catalogId": row["catalog_id"],
        "catalogSku": row["catalog_sku"],
        "productId": product_id,
        "title": row["title"],
        "profile": plan.profile,
        "axes": list(plan.axes),
        "sourceCount": len(sources),
        "sources": report_sources,
    }


def merge_catalog(config_path: Path, generated: list[dict]):
    source = config_path.read_text()
    document = yaml.safe_load(source)
    existing = list(document.get("products") or [])
    generated_ids = {row["id"] for row in generated}
    merged = [
        row for row in existing
        if row.get("id") not in generated_ids
    ] + generated
    match = PRODUCTS_KEY.search(source)
    if not match:
        raise ValueError("managed catalog does not contain products:")
    preamble = source[: match.start()]
    body = yaml.safe_dump(
        {"products": merged},
        sort_keys=False,
        allow_unicode=True,
        width=100,
        default_flow_style=False,
    )
    if not preamble.endswith("\n"):
        preamble += "\n"
    config_path.write_text(f"{preamble}{body}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--export-root",
        type=Path,
        default=Path.home() / "Documents" / "golfballs-catalog-export",
    )
    parser.add_argument(
        "--config-root",
        type=Path,
        default=Path.home() / "Documents" / "api-access-configs",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Merge generated products into golfballs-image-generation.yaml.",
    )
    args = parser.parse_args()

    export_root = args.export_root.resolve()
    config_root = args.config_root.resolve()
    index = json.loads(
        (export_root / "balanced-pages-index.json").read_text()
    )
    catalog = json.loads(
        (export_root / "balanced-products.json").read_text()
    )["products"]
    if len(index) != len(catalog):
        raise ValueError("balanced page index and product selection differ")

    generated = []
    report = []
    for offset, plan in enumerate(PLANS, start=1):
        index_row = index[plan.index - 1]
        catalog_row = catalog[plan.index - 1]
        if index_row.get("status") != 200:
            raise ValueError(
                f"product {plan.index} page failed with {index_row.get('status')}"
            )
        page = export_root / "balanced-product-pages" / index_row["pageFile"]
        product = read_product(page)
        if "Golf_Balls" in str(catalog_row.get("itemType_s") or ""):
            raise ValueError(f"golf-ball product reached importer: {plan.index}")
        row, audit = build_product(
            plan,
            catalog_row,
            index_row,
            product,
            export_root,
            config_root / "references",
            sort=50 + offset * 10,
        )
        generated.append(row)
        report.append(audit)

    draft_path = export_root / "managed-mockup-catalog-draft.json"
    draft_path.write_text(json.dumps(generated, indent=2) + "\n")
    report_path = export_root / "managed-mockup-catalog-audit.json"
    report_path.write_text(json.dumps({
        "generatedProducts": len(generated),
        "generatedSources": sum(row["sourceCount"] for row in report),
        "excludedGolfBalls": True,
        "products": report,
    }, indent=2) + "\n")
    if args.apply:
        merge_catalog(
            config_root / "golfballs-image-generation.yaml",
            generated,
        )
    print(json.dumps({
        "products": len(generated),
        "sources": sum(row["sourceCount"] for row in report),
        "draft": str(draft_path),
        "audit": str(report_path),
        "applied": args.apply,
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
