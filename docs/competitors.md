# Конкурентный ресёрч: редакторы сценариев «если-то» для умного дома и ЖК

Дата: 2026-10-31. Пометка (знание) означает, что пункт взят из общеизвестной документации продукта и в этом заходе по ссылке не перепроверялся. Остальное подтверждено поиском, ссылки в разборе.

## 1. Сводная таблица

| Продукт | Тип | Описание устройств | Редактор | Симуляция/тесты | Конфликты | Роли | LLM |
|---|---|---|---|---|---|---|---|
| Home Assistant | DIY-хаб | Entity + device + integration, домены и сервисы | Форма UI, YAML, blueprints | Traces (история прогонов, по умолчанию 5), запуск вручную; эмулятора нет | Нет (запрос на движок открыт) | Нет, один дом | Сторонние плагины, не ядро |
| Node-RED | Потоки (flow) | Нет своей модели, зависит от нод | Блоки-потоки + JS | Debug-панель, юнит-тесты узлов через сторонние модули | Нет | Нет | Сторонние ноды |
| IFTTT | Облачные апплеты | Сервисы и каналы | Форма «if this then that» | Нет | Нет | Нет | Есть генерация апплетов (знание) |
| SmartThings | Облако + хабы | Capabilities (JSON) | Routines (форма), Rules API (JSON) | Нет | Нет | Location, члены семьи | Нет (знание) |
| Apple Home | Экосистема | HomeKit/Matter | Форма | Нет | Нет | Владелец/участник | Нет |
| Google Home | Экосистема | Matter + Cloud-to-cloud traits | Форма + Script Editor (YAML) | Нет | Нет | Household | Gemini «Help me create» |
| Яндекс Умный дом | Экосистема РФ | Capabilities + properties | Форма «если / тогда», задержки | Кнопка запуска сценария | Нет | Дом, комнаты, семья | Алиса: голос, не генерация правил |
| Sber Salute | Экосистема РФ | Модель устройств Sber | Форма + диалог с колонкой | Нет | Нет | Семья | Диалог для создания сценария |
| Xiaomi Mi Home | Экосистема | MIoT spec (siid/piid) | Форма | Нет | Нет | Семья | Нет (знание) |
| Tuya Smart | Облако + PaaS | DP (data points) + стандартные категории | Форма scene/automation | Нет | Нет | Home, Smart Life | Нет (знание) |
| openHAB | DIY-хаб | Thing, Channel, Item | Rules DSL, JS, Blockly, UI | Нет симулятора | Нет | Нет | Нет |
| Homey Flow | Хаб | Capabilities | Блоки Flow + Advanced Flow | Тест карточки | Нет | Семья | Помощник по Flow (знание) |
| Hubitat Rule Machine | Локальный хаб | Capabilities | Форма (Rule Machine) | Логи | Подсказка «In Use By» | Нет | Нет |
| Ujin OS | ЖК + умный дом | Каталог интеграций, 60+ типов в классификаторе Росстандарта | Конструктор в приложении (подробности закрыты) | Не найдено | Не найдено | Житель, УК | Не найдено |
| Rubetek | IoT-платформа для застройщика | Своя | Расписания, сценарии | Не найдено | Не найдено | Житель, УК | Не найдено |
| Домилэнд, Smartis | Умный дом | Данных в открытом доступе не найдено | - | - | - | - | - |
| Siemens Desigo CC | BMS | Объекты BACnet и др. | Графическая логика, process logic | Симуляция контроллера | На уровне инженера | Операторы по правам | Нет |
| Honeywell, Schneider EcoStruxure | BMS | BACnet, Modbus | Логические блоки, скрипты | Эмуляторы контроллеров у вендора (знание) | Нет | Операторы | Нет |
| Matter | Стандарт | Cluster, attribute, command, event | Нет | Нет | Нет | Fabric/ACL | Нет |
| W3C WoT TD | Стандарт | Properties, Actions, Events в JSON-LD | Нет | Нет | Нет | Нет | Нет |

## 2. Разбор по продуктам

### A. Умный дом

**Home Assistant.** Устройство описано как набор entity в доменах (light, climate, sensor), поверх сервисы. Редактор: форма trigger/condition/action, YAML, blueprints как шаблоны. Отладка: traces хранят последние 5 прогонов, YAML-автоматизациям нужен id ([документация](https://www.home-assistant.io/integrations/trace/)). Боли: при запуске одной автоматизации другой нет трейса вложенной ([discussion 2095](https://github.com/orgs/home-assistant/discussions/2095)), зависания «still running» ([issue 98073](https://github.com/home-assistant/core/issues/98073)). Конфликтов нет: при противоречивых командах побеждает последняя, запрос на детектор открыт ([discussion 2355](https://github.com/orgs/home-assistant/discussions/2355)). Все правила в одном automations.yaml, разделение ломает визуальный редактор ([форум](https://community.home-assistant.io/t/feature-request-allow-the-visual-editor-to-save-individual-yaml-files-per-automation/1024377)). LLM: исследование 2025 года показало, что GPT-модели дают валидные рутины, но путают разовые и постоянные команды ([arXiv 2505.02802](https://arxiv.org/abs/2505.02802v1)); готовые плагины сторонние ([ai_agent_ha](https://gittrend.io/repo/sbenodiz/ai_agent_ha)).

**Node-RED.** Своей модели устройств нет, зависит от нод. Редактор из блоков-потоков, состояние держат в context-переменных ([openHAB-форум](https://community.openhab.org/t/node-red-as-alternative-rule-engine/29509)). Симуляции и поиска конфликтов нет. Ролей нет. Боль: потоки превращаются в «спагетти», для жителя не годится (знание).

**IFTTT.** Модель: сервис, триггер, действие. Форма «if this then that», только цепочки, без сложных условий в бесплатной версии (знание). Тестов и конфликтов нет, ролей нет.

**SmartThings.** Устройства описаны capabilities (JSON-схемы с атрибутами и командами). Routines это UI поверх Rules API ([форум](https://community.smartthings.com/t/smartthings-api-rule-execution-and-trigger/281226)). Боли: часть capabilities не имеет полных presentations и не доступна в Routines, routines исчезают при удалении устройства, нет переменных и чтения значений других устройств, смещение рассвета ограничено 60 минутами ([форум](https://community.smartthings.com/t/smartthings-api-rule-execution-and-trigger/281226), [SharpTools](https://community.sharptools.io/t/sharptools-rules-vs-smartthings-routines/9000)). Rules API для сторонних приложений ограничен по числу установок.

**Apple Home.** Автоматизации формой, на базе HomeKit и Matter. Нет симуляции, нет условий уровня кода (нужны Shortcuts). Роли: владелец и участники. LLM для правил нет (знание).

**Google Home.** Script Editor с YAML для продвинутых, вспомогательный ИИ в редакторе ([CEPro](https://www.cepro.com/news/google-introduces-generative-ai-feature-in-script-editor/127872)). Новый редактор с Gemini «Help me create» создаёт автоматизацию из текста, часть функций в превью и по подписке ([Android Central](https://androidcentral.com/accessories/smart-home/i-build-helpful-smart-home-automations-with-this-nest-feature-in-the-google-home-app), [heise](https://heise.de/-10695522)). Симуляции и конфликтов нет. Ближайший к вашей идее по NL.

**Яндекс Умный дом.** Устройство: capabilities и properties. Редактор: «если» и «тогда», задержки между действиями, привязка к дому и комнате, часть сценариев теперь хранится локально на колонке или хабе. Тест это запуск сценария кнопкой. При сбое сети цепочка прерывается, обходной путь «добавьте задержку» ([справка Яндекса](https://alice.yandex.ru/support/ru/smart-home/scenarios/create)). Конфликты не проверяются.

**Sber Salute.** Сценарии в приложении и диалогом с колонкой, режимы «Я дома» и «Я не дома» ([Sostav](https://www.sostav.ru/publication/sber-rasshiryaet-linejku-ustrojstv-umnogo-doma-62470.html)). В 2022 году управление с iPhone было отключено из-за сетевых настроек ([iphones.ru](https://www.iphones.ru/iNotes/apple-otklyuchila-upravlenie-umnym-domom-ot-sbera-10-21-2022)). Тестов и конфликтов нет.

**Xiaomi Mi Home.** Модель MIoT spec (service, property, action). Автоматизации формой, часть выполняется только в облаке и зависит от региона сервера (знание). Тестов, ролей уровня УК нет.

**Tuya Smart.** Модель DP: числовой id, тип, режим (rw/ro). Одинаковые функции у разных производителей описаны разными DP, поэтому есть стандартные категории (знание, [Tuya IoT docs](https://developer.tuya.com)). Сцены формой, без симуляции.

**openHAB.** Thing, Channel, Item. Rules DSL, JS, Blockly. Конфликты правил это частая тема форума ([пример](https://community.openhab.org/t/solved-rules-conflicting-each-other/59870/2)), инструментов поиска нет.

**Homey Flow.** Блоки Flow, capabilities, Advanced Flow с графом. Лучший UX из DIY. Симуляции нет, есть тест отдельной карточки (знание).

**Hubitat Rule Machine.** Форма с условиями, мощная, но перегруженная. Причины сбоев: пересекающиеся правила, отсутствие задержек. Единственная подсказка о конфликтах это список «In Use By» у устройства и логи с true/false по условиям ([Trunetto](https://www.trunetto.com/troubleshooting/smart-hubs/hubitat/hubitat-rule-machine-not-working)). Гонки между правилами описаны в [ветке сообщества](https://community.smartthings.com/t/updated-rule-machine-with-triggers/31084?page=9).

### B. Здание, ЖК, BMS

**Ujin OS.** На сайте: «10+ сценариев умного дома», «сложные сценарии» в приложении, 100+ (в FAQ 120+) интеграций, управление голосом, приложением и выключателями, личный кабинет УК с реестром заявок и избранными фильтрами, настройка прав доступа, система оповещения об инцидентах ([ujin.tech](https://ujin.tech)). Публичного API и описания редактора правил на странице нет, поиска конфликтов и симуляции не найдено. Масштаб: более 160 тыс. квартир к концу 2024, грант ФРИИ/ВЭБ.РФ, 322,6 млн руб. ([ComNews](https://www.comnews.ru/digital-economy/content/233129/2024-05-14/2024-w20/1012/otechestvennaya-it-platforma-sdelaet-doma-umnymi), [ComNews 2025](https://www.comnews.ru/content/241948/2025-10-23/2025-w43/1011/ujin-vykhodit-rynok-kazakhstana)). Это ваша базовая платформа, поэтому дыра находится прямо в ней.

**Rubetek.** Единая IoT-платформа: общедомовые системы (доступ, учёт ресурсов, видео, пожарка) плюс умный дом, поставщик ГК ФСК, 400+ ЖК ([Yandex Cloud](https://yandex.cloud/ru/cases/rubetek), [ComNews](https://www.comnews.ru/content/217164/2021-10-27/2021-w43/gk-fsk-i-rubetek-zapuskayut-odin-krupneyshikh-proptech-proektov-sfere-zhiloy-nedvizhimosti)). Публично видны расписания и голос, конструктор для УК не описан. Домилэнд и Smartis: открытых данных о сценарном движке найти не удалось.

**Siemens Desigo CC.** Инженерная настройка объектов и process logic, симуляция контроллера для проверки графики ([Siemens](https://support.industry.siemens.com/tf/ww/en/posts/184259), [Engineering Framework](https://assets.new.siemens.com/siemens/assets/api/uuid:042edf4b-5b49-4670-9b4e-cdb85829bbc1/Desigo-Engineering-Framework-presentation-EN.pdf)). Это инструмент инженера, не жителя, порог входа высокий, LLM нет.

**Honeywell и Schneider EcoStruxure.** Логические блоки и скрипты на уровне контроллеров, вендорские эмуляторы (знание, по этим двум в поиске данных не нашлось). Сценариев «квартира плюс общедомовое» и жителя как пользователя нет.

### C. Языки описания устройств

**Matter.** Cluster с attributes, commands, events, типизированная модель, ACL через fabrics. Нет языка правил. Нужны сертифицированные устройства.

**HA entity model.** Практический, но привязан к HA, без формальной спецификации для интеграторов.

**SmartThings capabilities.** JSON-схема атрибутов и команд, ближе всего к «единому языку», но закрыта в экосистеме.

**Яндекс capabilities/properties.** Хорошо типизированы (on_off, range, color_setting, float-свойства), но только для устройств Яндекса, и нет описания зон здания.

**W3C WoT Thing Description.** Properties, Actions, Events в JSON-LD, независим от протокола ([спецификация](https://www.w3.org/TR/2019/CR-wot-thing-description-20190516/)). Самый подходящий формат для интеграторов, но почти нет инструментов правил и симуляции на его основе.

**Tuya DP.** Плоский список data points, семантика зависит от категории, нужны маппинги.

## 3. Дыры рынка

1. **Тест сценария до внедрения.** У всех «запусти и посмотри». Частично: Яндекс (кнопка запуска), HA (traces уже после прогона), Siemens (симуляция контроллера, только для инженера). Эмулятора устройств для проверки правила жителя нет.
2. **Поиск конфликтов между правилами.** Нет ни у одного потребительского продукта. Частично: Hubitat («In Use By»). В HA это открытый запрос ([#2355](https://github.com/orgs/home-assistant/discussions/2355)).
3. **Сценарии уровня здания.** Правило «если в 3 квартирах протечка, перекрыть стояк и уведомить УК» не поддерживается явно. Частично: Rubetek и Ujin объединяют общедомовое и квартиры в одной платформе, но открытых данных о сценариях через эти границы нет.
4. **Разделение ролей в одном правиле.** Житель управляет своим, УК задаёт ограничения (например, лимит температуры, приоритет аварийных сценариев). У потребительских платформ роли только владелец и семья. У BMS роли операторские, не жилые.
5. **Естественный язык с проверкой.** Частично: Google Home (Help me create), Sber (диалог), HA (сторонние плагины). Ни у кого генерация не сопровождается верификацией и симуляцией. Исследование HA показало путаницу разовых и постоянных команд ([arXiv](https://arxiv.org/abs/2505.02802v1)), то есть проверка нужна.
6. **Единый формат устройств для интеграторов.** Матрица стандартов (Matter, WoT, Tuya DP, MIoT) не склеена. Частично: SmartThings capabilities, WoT TD. Для ЖК с оборудованием разных вендоров общего слоя с эмулятором нет.
7. **Объяснимость.** Почему правило сработало или нет. Частично: HA traces, Hubitat логи. У жителя и УК объяснений человеческим языком нет, у Яндекса сбой цепочки лечится «добавьте задержку».
8. **Устойчивость правил к смене устройств.** У SmartThings routines исчезают при удалении устройства. Привязка правила к возможности, а не к конкретному устройству, нигде не реализована как продукт.

## 4. Что взять на защиту

1. У Home Assistant и Hubitat нет проверки конфликтов правил до запуска (в HA это открытый запрос, [#2355](https://github.com/orgs/home-assistant/discussions/2355)), мы это закрываем статическим анализом правил по общим устройствам и возможностям с предупреждением перед сохранением.
2. У Яндекса, Sber и SmartThings нет проверки сценария до внедрения, тест это ручной запуск ([справка Яндекса](https://alice.yandex.ru/support/ru/smart-home/scenarios/create)), мы это закрываем прогоном правила на эмуляторах устройств с отчётом по шагам.
3. У Ujin на публичном сайте нет описания API и поиска конфликтов в «сложных сценариях» ([ujin.tech](https://ujin.tech)), мы это закрываем открытым описанием устройств и редактором с валидацией для интеграторов.
4. У Google Home и Home Assistant генерация сценария из текста идёт без верификации ([Android Central](https://androidcentral.com/accessories/smart-home/i-build-helpful-smart-home-automations-with-this-nest-feature-in-the-google-home-app), [arXiv](https://arxiv.org/abs/2505.02802v1)), мы это закрываем так: LLM выдаёт правило в нашем формате, затем оно проходит проверку и эмулятор до включения.
5. У потребительских платформ нет сценариев «квартира плюс общедомовое» с разными ролями, у BMS Siemens они только для инженера ([Siemens](https://assets.new.siemens.com/siemens/assets/api/uuid:042edf4b-5b49-4670-9b4e-cdb85829bbc1/Desigo-Engineering-Framework-presentation-EN.pdf)), мы это закрываем двумя уровнями правил: жилец правит своё, УК задаёт общедомовые и приоритетные, конфликты решаются приоритетом.
