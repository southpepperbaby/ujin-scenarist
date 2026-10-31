#!/usr/bin/env python3
"""Генерирует .env из доступы.json (который лежит вне репо)"""
import json
import os
from pathlib import Path

# Путь к доступы.json (лежит рядом с репо, не в нём)
ACCESS_FILE = Path(__file__).parent.parent / "доступы.json"

if not ACCESS_FILE.exists():
    print("❌ доступы.json не найден!")
    exit(1)

data = json.loads(ACCESS_FILE.read_text())

env_lines = [
    f"UJIN_API_URL={data['api_base'].strip()}",
    f"UJIN_COS_TOKEN={data['cos_token'].strip()}",
    f"UJIN_EMPLOYEE_LOGIN={data['employee']['login'].strip()}",
    f"UJIN_EMPLOYEE_PASSWORD={data['employee']['password'].strip()}",
    f"UJIN_APARTMENT_ID={data['team_apartment'].strip()}",
]

# Добавляем резидентов
for i, resident in enumerate(data["residents"], 1):
    env_lines.append(f"UJIN_UST_RES{i}={resident['ust'].strip()}")

# Добавляем устройства
for device in data["devices"]:
    family = device["family"].upper()
    env_lines.append(f"UJIN_SN_{family}={device['sn'].strip()}")
    env_lines.append(f"UJIN_EXT_{family}={device['ext'].strip()}")

# Записываем .env
env_path = Path(__file__).parent.parent / ".env"
env_path.write_text("\n".join(env_lines) + "\n")
print(f"✅ .env создан: {env_path}")
