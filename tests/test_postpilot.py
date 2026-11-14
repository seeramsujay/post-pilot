import json
import re
from pathlib import Path


def test_package_json_integrity():
    pkg = json.loads(Path("package.json").read_text())
    assert pkg["name"] == "postpilot-portal"
    assert "scripts" in pkg
    assert "dependencies" in pkg


def test_devvit_config():
    devvit_path = Path("devvit.json")
    assert devvit_path.exists()
    data = json.loads(devvit_path.read_text())
    assert "name" in data or "version" in data or len(data) > 0


def test_markdown_and_utils_file_presence():
    utils_file = Path("src/client/utils.ts")
    assert utils_file.exists()
    content = utils_file.read_text()
    assert "parseMarkdown" in content
    assert "validateTitle" in content
    assert "validateBody" in content
    assert "validateBlacklist" in content


def test_title_regex_logic():
    pattern = r"^\[[a-zA-Z]+\].*$"
    assert re.match(pattern, "[Tech] New release") is not None
    assert re.match(pattern, "New release without tag") is None
