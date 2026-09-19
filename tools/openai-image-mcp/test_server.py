import base64
import os
from pathlib import Path
from types import SimpleNamespace

from PIL import Image


def test_platform_output_dimensions(tmp_path, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("OPENAI_IMAGE_OUTPUT_DIR", str(tmp_path))
    import server

    server.OUTPUT_DIR = tmp_path
    source = tmp_path / "source.png"
    Image.new("RGB", (64, 64), "red").save(source)
    destination = tmp_path / "result.png"
    server._crop_resize(source, destination, (1080, 1350))
    with Image.open(destination) as image:
        assert image.size == (1080, 1350)


def test_filename_is_confined_to_simple_name():
    import server

    assert "/" not in server._safe_filename("../../escape.png")
    assert server._safe_filename("campaign final.png") == "campaign_final.png"
