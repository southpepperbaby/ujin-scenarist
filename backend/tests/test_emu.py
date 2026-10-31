from app.bus import EventBus
from app.emu import DeviceRegistry, family_info


def make_registry():
    bus = EventBus()
    return bus, DeviceRegistry(bus)


def test_leak_sensor_reacts_to_water():
    bus, reg = make_registry()
    leak = reg.create("leak", room="Кухня")
    assert leak.state()["leak"] == 0
    reg.inject(leak.id, "wet", True)
    reg.step_all()
    assert leak.state()["leak"] == 1
    kinds = [(e.kind, e.data.get("signal")) for e in bus.history]
    assert ("signal", "leak") in kinds


def test_command_only_for_writable_signals():
    _, reg = make_registry()
    light = reg.create("light")
    changed = reg.command(light.id, "lamp", 1)
    assert changed.get("lamp") == 1
    try:
        reg.command(light.id, "power_w", 5)
    except PermissionError:
        pass
    else:
        raise AssertionError("read-only signal accepted a command")


def test_ujin_binding_is_taken_once():
    bus = EventBus()
    reg = DeviceRegistry(bus, ujin_devices=[{"family": "leak", "sn": "1", "ext": "x_leak"}])
    first = reg.create("leak")
    second = reg.create("leak")
    assert first.ujin and first.ujin["sn"] == "1"
    assert second.ujin is None


def test_family_info_has_three_groups():
    info = family_info("ventilation")
    groups = {s["group"] for s in info["declaration"]}
    assert {"property", "capability", "setting"} <= groups
