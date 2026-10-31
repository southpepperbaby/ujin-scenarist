"""Демо-дом: устройства квартиры и общедомовое, эталонные правила из ТЗ."""
from __future__ import annotations

from .rules import Dispatch, Notify, Rule, SetSignal, TimeCondition, Trigger

# id, семейство, название, помещение, уровень, параметры эмулятора
SEED_DEVICES = [
    ("kitchen-leak", "leak", "Датчик протечки", "Кухня", "apartment", {}),
    ("kitchen-valve", "valve", "Клапан холодной воды", "Кухня", "apartment", {}),
    ("water-meter", "counter", "Счётчик холодной воды", "Санузел", "apartment", {"resource": "cold"}),
    ("hall-light", "light", "Свет в коридоре", "Коридор", "apartment", {}),
    ("bedroom-thermostat", "thermostat", "Термостат", "Спальня", "apartment", {}),
    ("kitchen-smoke", "fire", "Пожарный датчик", "Кухня", "apartment", {}),
    ("bedroom-vent", "ventilation", "Вентиляция", "Спальня", "apartment", {}),
    ("yard-barrier", "barrier", "Шлагбаум", "Двор", "building", {}),
    ("lift-1", "elevator", "Лифт", "Подъезд 1", "building", {"floors": 9}),
]


def seed_rules() -> list[Rule]:
    return [
        Rule(
            id="leak-shutoff",
            title="Протечка: перекрыть воду",
            description="Эталонный сценарий ТЗ: протечка → клапан перекрыл воду → консьержу сигнал → жителю уведомление.",
            owner="resident", priority=50, status="active",
            trigger=Trigger(device_id="kitchen-leak", signal="leak", op="eq", value=1),
            actions=[
                SetSignal(device_id="kitchen-valve", signal="valve", value=0),
                Notify(target="concierge", level="critical",
                       message="Протечка на кухне, кв. 2806. Клапан холодной воды перекрыт автоматически."),
                Notify(target="resident", level="critical",
                       message="На кухне протечка. Мы перекрыли воду, консьерж уже в курсе."),
            ],
        ),
        Rule(
            id="leak-night-light",
            title="Протечка ночью: включить свет в коридоре",
            owner="resident", priority=40, status="active",
            trigger=Trigger(device_id="kitchen-leak", signal="leak", op="eq", value=1),
            conditions=[TimeCondition(start="22:00", end="07:00")],
            actions=[SetSignal(device_id="hall-light", signal="lamp", value=1)],
        ),
        Rule(
            id="smoke-alarm",
            title="Пожар: открыть шлагбаум и вызвать лифт на 1 этаж",
            description="Правило УК уровня дома: проезд для пожарных и лифт на основном посадочном этаже.",
            scope="building", owner="uk", priority=100, status="active",
            trigger=Trigger(device_id="kitchen-smoke", signal="alarm", op="eq", value=1),
            actions=[
                SetSignal(device_id="yard-barrier", signal="open_cmd", value=1),
                SetSignal(device_id="lift-1", signal="call_requested", value=1),
                Notify(target="concierge", level="critical", message="Пожарная тревога в кв. 2806. Шлагбаум открыт, лифт вызван на 1 этаж."),
                Notify(target="resident", level="critical", message="Сработал пожарный датчик на кухне. Покиньте квартиру."),
            ],
        ),
        Rule(
            id="valve-jammed",
            title="Клапан заклинило: вызвать сантехника",
            description="Правило УК уровня дома: защита от протечки не сработает — сантехник едет сразу, консьерж и житель в курсе.",
            scope="building", owner="uk", priority=95, status="active",
            trigger=Trigger(device_id="kitchen-valve", signal="jammed", op="eq", value=1),
            actions=[
                Notify(target="concierge", level="critical",
                       message="В кв. 2806 заклинило клапан холодной воды: при протечке вода не перекроется."),
                Dispatch(category="plumbing", note="Заклинил клапан холодной воды, кв. 2806"),
                Notify(target="resident", level="critical",
                       message="Клапан воды на кухне не срабатывает. Сантехник уже вызван."),
            ],
        ),
        Rule(
            id="lift-emergency",
            title="Авария лифта: вызвать лифтёров",
            description="Правило УК уровня дома: лифт встал — консьерж проверяет кабину, лифтовая служба выезжает, жильцы предупреждены.",
            scope="building", owner="uk", priority=90, status="active",
            trigger=Trigger(device_id="lift-1", signal="emergency", op="eq", value=1),
            actions=[
                Notify(target="concierge", level="critical",
                       message="Авария лифта в подъезде 1. Проверьте, нет ли людей в кабине."),
                Dispatch(category="lift", note="Лифт подъезда 1 встал в аварии"),
                Notify(target="resident", level="warning",
                       message="Лифт в подъезде 1 временно не работает, специалисты уже едут."),
            ],
        ),
        Rule(
            id="barrier-jam",
            title="Шлагбаум застрял: вызвать мастера",
            description="Правило УК уровня дома: стрела застряла — консьерж следит за проездом, мастер по доступу выезжает.",
            scope="building", owner="uk", priority=70, status="active",
            trigger=Trigger(device_id="yard-barrier", signal="alarm", op="eq", value=1),
            actions=[
                Notify(target="concierge", level="warning", message="Шлагбаум во дворе застрял. Проверьте проезд."),
                Dispatch(category="access", note="Застревание шлагбаума во дворе"),
                Notify(target="resident", level="info",
                       message="Шлагбаум во дворе временно не работает, мастер уже вызван."),
            ],
        ),
        Rule(
            id="cold-bedroom",
            title="Холодно в спальне: сказать жителю",
            owner="resident", priority=50, status="draft", enabled=False,
            trigger=Trigger(device_id="bedroom-thermostat", signal="temperature", op="lt", value=18),
            actions=[Notify(target="resident", message="В спальне ниже 18 °C.")],
        ),
    ]
