"""Сценарии из features/ гоняются на демо-доме: тот же формат, что приёмка организаторов (behave)."""
from pathlib import Path

import pytest

from app import gherkin
from app.bus import EventBus
from app.emu import DeviceRegistry
from app.seed import SEED_DEVICES, seed_rules

FEATURES = Path(__file__).resolve().parent.parent / "features"


def demo_house():
    reg = DeviceRegistry(EventBus())
    for device_id, family, title, room, scope, kwargs in SEED_DEVICES:
        reg.create(family, title=title, room=room, scope=scope, device_id=device_id, **kwargs)
    return reg


RULES = {r.id: r for r in seed_rules()}


@pytest.mark.asyncio
@pytest.mark.parametrize("path", sorted(FEATURES.glob("*.feature")), ids=lambda p: p.stem)
async def test_feature_files_pass(path):
    reg = demo_house()
    rule = RULES[path.stem]
    report = await gherkin.run_feature(path.read_text(encoding="utf-8"), rule, reg, [])
    failed = [(s["name"], st["text"], st["detail"]) for s in report["scenarios"] for st in s["steps"]
              if st["status"] != "passed"]
    assert report["passed"], failed


def test_generated_feature_matches_committed_file():
    reg = demo_house()
    for path in FEATURES.glob("*.feature"):
        assert gherkin.to_feature(RULES[path.stem], reg) == path.read_text(encoding="utf-8")


@pytest.mark.asyncio
async def test_wrong_expectation_fails_the_step():
    reg = demo_house()
    rule = RULES["leak-shutoff"]
    text = gherkin.to_feature(rule, reg).replace("команду «Клапан» = «закрыт»", "команду «Клапан» = «открыт»")
    report = await gherkin.run_feature(text, rule, reg, [])
    assert not report["passed"]


@pytest.mark.asyncio
async def test_unknown_step_is_reported_not_crashing():
    reg = demo_house()
    rule = RULES["leak-shutoff"]
    text = "Функция: x\n  Сценарий: y\n    Когда кот уронил вазу\n    Тогда правило «x» выполнено\n"
    report = await gherkin.run_feature(text, rule, reg, [])
    steps = report["scenarios"][0]["steps"]
    assert steps[0]["status"] == "undefined" and steps[1]["status"] == "skipped"
