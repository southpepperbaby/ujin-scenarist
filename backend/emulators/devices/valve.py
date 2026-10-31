"""Клапан воды — семейство `valve` (заготовка new_device.py, физика наша).

Шаровой кран с электроприводом: команда `valve` 0/1, привод поворачивается за
`travel_time` тиков, пока идёт ход — `state=moving`. Через открытый клапан идёт
расход `flow_lpm`, через закрытый — ноль. Заклинивание привода — авария `jammed`.
"""
from __future__ import annotations

from core import Device, Signal

CLOSED, OPEN, MOVING = 0, 1, 2


class ValveDevice(Device):
    model = "emul_valve"
    title = "Клапан воды"

    def __init__(self, *args, flow: float = 6.0, **kwargs):
        super().__init__(*args, **kwargs)
        self.nominal_flow = flow
        self._target = OPEN
        self._left = 0
        self.add_signal(Signal("valve", "Клапан", "switch", "rw", "capability", OPEN,
                               layout={0: "закрыт", 1: "открыт"}))
        self.add_signal(Signal("state", "Положение", "list", "r", "property", OPEN,
                               layout={0: "закрыт", 1: "открыт", 2: "в движении"}))
        self.add_signal(Signal("flow_lpm", "Расход", "graph", "r", "property", flow, "л/мин", 0, 30))
        self.add_signal(Signal("jammed", "Заклинило", "list", "r", "property", 0,
                               layout={0: "норма", 1: "авария"}))
        self.add_signal(Signal("travel_time", "Время хода, тиков", "counter", "rw", "setting", 2,
                               "тик", 1, 20))

    def set_jam(self, on: bool) -> None:
        self.set_value("jammed", 1 if on else 0)

    def on_command(self, name, value) -> None:
        if name == "valve":
            target = OPEN if int(value) else CLOSED
            if self.signals["jammed"].value:
                self.log(f"[{self.model}] привод заклинило, команда не исполнена")
                self.set_value("valve", self.signals["state"].value if self.signals["state"].value != MOVING else self._target)
                return
            self._target = target
            self._left = int(self.signals["travel_time"].value)
            self.set_value("state", MOVING)

    def tick(self, dt: int) -> None:
        if self.signals["state"].value == MOVING:
            self._left -= dt
            if self._left <= 0:
                self.set_value("state", self._target)
                self.log(f"[{self.model}] клапан {'открыт' if self._target else 'закрыт'}")
        flow = self.nominal_flow if self.signals["state"].value == OPEN else 0.0
        self.set_value("flow_lpm", flow)
