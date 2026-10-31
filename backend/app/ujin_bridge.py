"""
Интеграция с Ujin OS: reader (pull событий) + publisher (отправка сигналов)
"""
import os
import time
import requests
from .config import settings

API_URL = os.getenv("UJIN_API_URL")
UST_TOKEN = os.getenv("UJIN_UST_RES1")

class UjinBridge:
    def __init__(self):
        self.session = requests.Session()
        self.last_task_dt = {}  # Дедупликация команд
    
    def pull_events(self):
        """Читаем события с платформы (Путь A из PULL-CLIENT.md)"""
        while True:
            try:
                # devices/difference — дельта значений
                r = self.session.get(
                    f"{API_URL}/devices/difference/",
                    params={"token": UST_TOKEN, "dt": int(time.time()) - 60},
                    timeout=10
                )
                data = r.json()
                
                if data.get("error") == 0:
                    for device in data.get("data", []):
                        self._process_device(device)
                
            except Exception as e:
                print(f"❌ Ошибка pull: {e}")
            
            time.sleep(3)  # Polling каждые 3 секунды
    
    def publish_signal(self, ext_guid: str, signal: str, value: float):
        """Публикуем сигнал на платформу (group-update-device-signal)"""
        if value == 0:
            value = 0.001  # Мина: 0 не проходит
        
        payload = {
            "data": [{
                "sn": ext_guid,
                "s": f"integrations_devices_{signal}",
                "v": value,
                "c": "integrations_devices"
            }]
        }
        
        r = self.session.post(
            f"{API_URL}/import_device/group-update-device-signal/",
            params={"device-token": UST_TOKEN},
            json=payload,
            timeout=10
        )
        
        return r.json()
    
    def _process_device(self, device: dict):
        """Обрабатываем события от устройства"""
        # Здесь логика: если leak=1 → публикуем siren=1
        pass

if __name__ == "__main__":
    bridge = UjinBridge()
    bridge.pull_events()
