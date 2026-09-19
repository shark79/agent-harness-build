"""Local Streamable HTTP MCP server for OpenAI campaign image generation.

The API key remains in this process. TrueForge receives only tool arguments and
the resulting local artifact metadata; it never receives the key.
"""
from __future__ import annotations

import base64
import os
import re
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from fastmcp import FastMCP
from openai import OpenAI
from PIL import Image


REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(REPO_ROOT / ".env", override=False)

OUTPUT_DIR = Path(os.environ.get("OPENAI_IMAGE_OUTPUT_DIR", Path(__file__).parent / "generated")).resolve()
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

PLATFORMS = {
    "meta": {"generation_size": "1088x1088", "final_size": (1080, 1080), "filename": "product_meta_ad_1080x1080.png",
              "direction": "Square social ad. Show a relatable problem-solution moment and leave clean negative space for a short headline."},
    "linkedin": {"generation_size": "2048x1152", "final_size": (1920, 1080), "filename": "product_linkedin_post_1920x1080.png",
                  "direction": "Wide professional marketing image. Use a credible workplace or productivity context and leave space for a concise headline."},
    "tiktok": {"generation_size": "1152x2048", "final_size": (1080, 1920), "filename": "product_tiktok_post_1080x1920.png",
               "direction": "Full-screen vertical creator-style image with an immediate visual hook. Keep important content away from top and bottom interface areas."},
    "instagram": {"generation_size": "1088x1360", "final_size": (1080, 1350), "filename": "product_instagram_post_1080x1350.png",
                   "direction": "Vertical lifestyle image with authentic UGC styling and tasteful negative space for optional campaign copy."},
}
ModelName = Literal["gpt-image-2.5-flare", "gpt-image-2.5-sunburst"]
Quality = Literal["low", "medium", "high", "xhigh", "max"]
Platform = Literal["meta", "linkedin", "tiktok", "instagram"]

mcp = FastMCP("OpenAI Campaign Image Generator")


def _client() -> OpenAI:
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not key:
        raise RuntimeError("OPENAI_API_KEY is not configured in the MCP server environment")
    return OpenAI(api_key=key)


def _safe_filename(name: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("._")
    if not cleaned or cleaned in {".", ".."}:
        raise ValueError("filename must contain at least one safe character")
    return cleaned[:120]


def _crop_resize(source: Path, destination: Path, target: tuple[int, int]) -> None:
    with Image.open(source) as image:
        image = image.convert("RGB")
        source_ratio = image.width / image.height
        target_ratio = target[0] / target[1]
        if source_ratio > target_ratio:
            width = int(image.height * target_ratio)
            left = (image.width - width) // 2
            image = image.crop((left, 0, left + width, image.height))
        elif source_ratio < target_ratio:
            height = int(image.width / target_ratio)
            top = (image.height - height) // 2
            image = image.crop((0, top, image.width, top + height))
        image.resize(target, Image.Resampling.LANCZOS).save(destination, format="PNG", optimize=True)


def _prompt(platform: str, product_description: str, campaign_theme: str, target_audience: str, visual_style: str) -> str:
    return f"""Create a campaign-ready product advertising image.

Product: {product_description}
Campaign theme: {campaign_theme}
Target audience: {target_audience}
Visual style: {visual_style}
Platform direction: {PLATFORMS[platform]['direction']}

Keep the product as the clear visual focus. Use believable lighting, materials,
proportions, hands, and reflections. Do not invent unsupported product claims.
Do not include logos, watermarks, or written advertising copy. Produce a finished
image, not a collage or mockup. Leave useful negative space for copy added later.
"""


@mcp.tool()
def generate_campaign_image(
    platform: Platform,
    product_description: str,
    campaign_theme: str,
    target_audience: str,
    visual_style: str = "Photorealistic UGC product photography",
    model: ModelName = "gpt-image-2.5-flare",
    quality: Quality = "medium",
) -> dict:
    """Generate one platform-specific campaign asset with OpenAI's Image API."""
    config = PLATFORMS[platform]
    response = _client().images.generate(
        model=model,
        prompt=_prompt(platform, product_description, campaign_theme, target_audience, visual_style),
        size=config["generation_size"],
        quality=quality,
        output_format="png",
        n=1,
    )
    encoded = response.data[0].b64_json
    if not encoded:
        raise RuntimeError("OpenAI returned no base64 image data")
    source = OUTPUT_DIR / f".{platform}_source.png"
    destination = OUTPUT_DIR / config["filename"]
    source.write_bytes(base64.b64decode(encoded))
    try:
        _crop_resize(source, destination, config["final_size"])
    finally:
        source.unlink(missing_ok=True)
    return {"success": True, "platform": platform, "model": model, "quality": quality,
            "filename": destination.name, "file_path": str(destination),
            "dimensions": f"{config['final_size'][0]}x{config['final_size'][1]}", "format": "PNG"}


@mcp.tool()
def generate_four_platform_campaign(
    product_description: str,
    campaign_theme: str,
    target_audience: str,
    visual_style: str = "Photorealistic UGC product photography",
    quality: Quality = "medium",
) -> dict:
    """Generate coordinated Meta, LinkedIn, TikTok, and Instagram assets."""
    assets = [generate_campaign_image(platform, product_description, campaign_theme, target_audience, visual_style, "gpt-image-2.5-flare", quality)
              for platform in PLATFORMS]
    return {"success": True, "assets": assets, "output_directory": str(OUTPUT_DIR)}


if __name__ == "__main__":
    mcp.run(transport="http", host=os.environ.get("MCP_HOST", "127.0.0.1"),
            port=int(os.environ.get("MCP_PORT", "8801")), path="/mcp")
