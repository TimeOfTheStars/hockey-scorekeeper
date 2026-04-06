# Сборка и CI

## Локальная сборка установщика

Из корня:

```bash
npm run build:desktop
```

Или из `apps/desktop-host`:

```bash
npm run tauri:build
```

Это выполняет `build:all` (оверлей + десктоп Vite) и **`tauri build`**. На выходе артефакты в `apps/desktop-host/src-tauri/target/release/bundle/` (форматы зависят от ОС: NSIS, MSI, DMG, deb, AppImage и т.д.).

### Требования

- Установленный **Rust** и платформенные зависимости Tauri v2.
- Перед первым `cargo build` должен существовать **`apps/obs-overlay/dist`** (скрипт сборки создаёт его через `beforeBuildCommand`).

---

## Версионирование

Перед релизом синхронизируйте версию в:

- `apps/desktop-host/package.json` (`version`) — используется CI при создании GitHub Release (см. workflow);
- `apps/desktop-host/src-tauri/tauri.conf.json` (`version`);
- `apps/desktop-host/src-tauri/Cargo.toml` (`version`).

---

## GitHub Actions: `Desktop release`

Файл: [.github/workflows/tauri-build.yml](../.github/workflows/tauri-build.yml).

### Триггеры

- **Push** в ветки `main` и `dev`.
- **workflow_dispatch** (ручной запуск).

### Задачи

1. **Матрица `build`**: `windows-latest`, `macos-latest`, `ubuntu-22.04`.
2. На каждой ОС: `npm ci` в `obs-overlay` и `desktop-host`, `npx tauri build`.
3. Артефакты: установочные файлы (`.exe`, `.msi`, `.dmg`, `.deb`, `.AppImage`) загружаются как отдельные артефакты job'а.
4. **Job `publish`** (на `ubuntu-latest`): скачивает артефакты, переименовывает, создаёт или обновляет **GitHub Release** через `gh release create`.

### Ветки и теги релиза

- **`main`**: релиз с тегом `v{version}` и заголовком `{version}` (версия из `apps/desktop-host/package.json`).
- **`dev`**: пререлиз с тегом `v{version}-dev`.

Скрипт публикации **удаляет** существующий релиз и тег с тем же именем перед созданием нового — каждый push в ветку обновляет соответствующий релиз.

### Права

В workflow задано `permissions: contents: write` для загрузки ассетов в релиз.

---

## Скачивание без Releases

В каждом прогоне workflow на вкладке **Actions** доступны артефакты сборки (имена вида `tauri-windows`, `tauri-macos`, `tauri-linux`). GitHub упаковывает их в zip при скачивании.

---

## Кросс-компиляция

Сборка **Windows** `.exe` на **macOS** в типовом сценарии не поддерживается «из коробки» так же надёжно, как нативная сборка. Практический путь — **CI на `windows-latest`** (как в этом workflow) или сборка на машине с Windows.
