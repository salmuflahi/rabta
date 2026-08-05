# Defined Workspaces — Phase 1 (pinning and curating) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user mark items in a task's capsule as pinned so they open on every resume even when they were closed, and delete captured items they do not want recorded.

**Architecture:** Pins live in a new `task_pins` table rather than as a flag inside `task_resources.payload`, so capture stays a faithful record and the "pins survive auto-save" rule holds by construction. Restore takes the union of the captured payload and the pins, deduped by a per-kind identity string. No connector changes at all — this ships without a store review.

**Tech Stack:** Rust (rusqlite, tokio, Tauri 2), React 18 + TypeScript, vitest, `cargo test`.

**Spec:** `docs/superpowers/specs/2026-08-04-defined-workspaces-design.md`

## Global Constraints

- **No connector changes in Phase 1.** Nothing under `connectors/` may be modified. If a task seems to need it, stop — that belongs to Phase 2.
- **Wire shapes are frozen.** `TabsState` (`{tabs: {url, title}[]}`) and `WorkspaceState` (`{workspaceFolder, openFiles, activeFile, terminals}`) must not change.
- **Identity strings** are exact: chrome → the tab URL; vscode file → the `fsPath`; vscode terminal → `name` + `"\0"` + `cwd ?? ""`.
- **`focusMode` does not exist in Phase 1.** Nothing closes anything. Restore stays additive.
- **Migrations are append-only.** Add `004_task_pins.sql`; never edit an existing migration file.
- **Copy style:** sentence case, no exclamation marks, state what is true then what to do about it.

---

### Task 1: `task_pins` table and its CRUD

**Files:**
- Create: `crates/omnibus-db/migrations/004_task_pins.sql`
- Modify: `crates/omnibus-db/src/lib.rs:10-14` (register the migration)
- Modify: `crates/omnibus-db/src/records.rs` (add methods at end of the `impl` containing `replace_task_resources`)
- Test: `crates/omnibus-db/src/records.rs` (inline `#[cfg(test)]` module, matching the file's existing convention)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `pub struct TaskPin { pub id: String, pub task_id: String, pub connector_kind: String, pub identity: String, pub payload: Value, pub created_at: String }`
  - `pub fn add_task_pin(&self, task_id: &str, connector_kind: &str, identity: &str, payload: &Value) -> Result<TaskPin>` — upsert; re-pinning the same identity replaces the payload and keeps one row.
  - `pub fn remove_task_pin(&self, task_id: &str, connector_kind: &str, identity: &str) -> Result<bool>` — `true` if a row was removed.
  - `pub fn task_pins(&self, task_id: &str) -> Result<Vec<TaskPin>>` — ordered by `created_at`.

- [ ] **Step 1: Write the failing test**

Add to `crates/omnibus-db/src/records.rs`, inside the existing `#[cfg(test)] mod tests`:

```rust
#[test]
fn task_pins_upsert_list_and_remove() {
    let db = test_db();
    let (_p, task) = seed_project_and_task(&db);

    let pin = db
        .add_task_pin(&task.id, "chrome", "https://a.test/", &json!({"url": "https://a.test/", "title": "A"}))
        .unwrap();
    assert_eq!(pin.identity, "https://a.test/");

    // Re-pinning the same identity replaces the payload rather than duplicating.
    db.add_task_pin(&task.id, "chrome", "https://a.test/", &json!({"url": "https://a.test/", "title": "A renamed"}))
        .unwrap();
    let pins = db.task_pins(&task.id).unwrap();
    assert_eq!(pins.len(), 1, "re-pinning must not duplicate: {pins:?}");
    assert_eq!(pins[0].payload["title"], "A renamed");

    // Same identity under a different connector kind is a different pin.
    db.add_task_pin(&task.id, "vscode", "https://a.test/", &json!({"path": "/x"}))
        .unwrap();
    assert_eq!(db.task_pins(&task.id).unwrap().len(), 2);

    assert!(db.remove_task_pin(&task.id, "chrome", "https://a.test/").unwrap());
    assert!(!db.remove_task_pin(&task.id, "chrome", "https://a.test/").unwrap());
    assert_eq!(db.task_pins(&task.id).unwrap().len(), 1);
}
```

If `test_db()` and `seed_project_and_task()` do not already exist in that test module, read the module's existing helpers and use whatever it uses to build a `Db` with a project and a task; do not invent new helpers.

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p rabta-db task_pins_upsert_list_and_remove`
Expected: FAIL — `no method named 'add_task_pin'`.

- [ ] **Step 3: Write the migration**

Create `crates/omnibus-db/migrations/004_task_pins.sql`:

```sql
-- Defined workspaces, phase 1: an item a user marked as "always open this".
-- Deliberately NOT a flag inside task_resources.payload — that payload is a
-- faithful record of what a connector reported, and replace_task_resources
-- replaces it wholesale on every capture. Keeping pins in their own table is
-- what makes "pins survive auto-save" true by construction rather than by a
-- read-merge-write nobody would notice breaking.
CREATE TABLE task_pins (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    connector_kind TEXT NOT NULL,
    identity TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (task_id, connector_kind, identity)
);

CREATE INDEX task_pins_task ON task_pins (task_id);
```

- [ ] **Step 4: Register the migration**

In `crates/omnibus-db/src/lib.rs`, extend the `MIGRATIONS` slice:

```rust
const MIGRATIONS: &[&str] = &[
    include_str!("../migrations/001_init.sql"),
    include_str!("../migrations/002_track_b_core.sql"),
    include_str!("../migrations/003_connector_version.sql"),
    include_str!("../migrations/004_task_pins.sql"),
];
```

- [ ] **Step 5: Write the record type and CRUD**

In `crates/omnibus-db/src/records.rs`, add the struct next to the other record structs (alongside `TaskResource`):

```rust
/// An item a user marked "always open this" for a task. Authored, never
/// captured — which is why it lives outside task_resources.payload.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TaskPin {
    pub id: String,
    pub task_id: String,
    pub connector_kind: String,
    pub identity: String,
    pub payload: Value,
    pub created_at: String,
}
```

Add the methods to the same `impl` block as `replace_task_resources`:

```rust
    /// Upsert: re-pinning an identity refreshes its payload and keeps one row,
    /// so a title change does not accumulate duplicates.
    pub fn add_task_pin(
        &self,
        task_id: &str,
        connector_kind: &str,
        identity: &str,
        payload: &Value,
    ) -> Result<TaskPin> {
        let r = TaskPin {
            id: new_id(),
            task_id: task_id.to_string(),
            connector_kind: connector_kind.to_string(),
            identity: identity.to_string(),
            payload: payload.clone(),
            created_at: now(),
        };
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        conn.execute(
            "INSERT INTO task_pins (id, task_id, connector_kind, identity, payload, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6) \
             ON CONFLICT (task_id, connector_kind, identity) \
             DO UPDATE SET payload = excluded.payload",
            params![
                r.id,
                r.task_id,
                r.connector_kind,
                r.identity,
                r.payload.to_string(),
                r.created_at
            ],
        )?;
        Ok(r)
    }

    /// True when a pin was actually removed; false when there was none.
    pub fn remove_task_pin(
        &self,
        task_id: &str,
        connector_kind: &str,
        identity: &str,
    ) -> Result<bool> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let n = conn.execute(
            "DELETE FROM task_pins WHERE task_id = ?1 AND connector_kind = ?2 AND identity = ?3",
            params![task_id, connector_kind, identity],
        )?;
        Ok(n > 0)
    }

    pub fn task_pins(&self, task_id: &str) -> Result<Vec<TaskPin>> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let mut stmt = conn.prepare(
            "SELECT id, task_id, connector_kind, identity, payload, created_at \
             FROM task_pins WHERE task_id = ?1 ORDER BY created_at",
        )?;
        let rows = stmt.query_map(params![task_id], |row| {
            let raw: String = row.get(4)?;
            Ok(TaskPin {
                id: row.get(0)?,
                task_id: row.get(1)?,
                connector_kind: row.get(2)?,
                identity: row.get(3)?,
                payload: serde_json::from_str(&raw).unwrap_or(Value::Null),
                created_at: row.get(5)?,
            })
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>().map_err(Into::into)
    }
```

If `params!`, `new_id()`, `now()`, or `Value` are not already imported at the top of `records.rs`, they are — `replace_task_resources` uses all four. Do not add imports.

- [ ] **Step 6: Run test to verify it passes**

Run: `cargo test -p rabta-db task_pins_upsert_list_and_remove`
Expected: PASS.

- [ ] **Step 7: Run the whole db suite for regressions**

Run: `cargo test -p rabta-db`
Expected: all pass. A migration added to the end must not disturb existing tests.

- [ ] **Step 8: Commit**

```bash
git add crates/omnibus-db/migrations/004_task_pins.sql crates/omnibus-db/src/lib.rs crates/omnibus-db/src/records.rs
git commit -m "feat(db): task_pins table

Pins are authored, not captured, so they live outside task_resources.payload:
that payload is a faithful record of what a connector reported, and
replace_task_resources replaces it wholesale on every capture. A separate
table makes 'pins survive auto-save' true by construction."
```

---

### Task 2: Identity, and merging pins into restore

**Files:**
- Modify: `apps/desktop/src-tauri/src/capsules.rs` (add `identity_of` + `merge_pins` near the restore helpers; call the merge in the restore path)
- Test: `apps/desktop/src-tauri/tests/capsules.rs`

**Interfaces:**
- Consumes: `Db::task_pins` from Task 1.
- Produces:
  - `pub fn identity_of(kind: &str, item: &Value) -> Option<String>` — chrome: `item["url"]`; vscode file: the string itself when `item` is a JSON string; vscode terminal: `name` + `\0` + `cwd ?? ""`. `None` when the shape does not match.
  - `pub fn merge_pins(kind: &str, captured: &Value, pins: &[TaskPin]) -> Value` — returns the captured payload with any pinned item not already present appended, deduped by identity, captured order first.

- [ ] **Step 1: Write the failing test**

Add to `apps/desktop/src-tauri/tests/capsules.rs`:

```rust
#[test]
fn merge_pins_appends_missing_and_never_duplicates() {
    use rabta_desktop_lib::capsules::{merge_pins, identity_of};
    use rabta_db::TaskPin;
    use serde_json::json;

    let pin = |kind: &str, identity: &str, payload: serde_json::Value| TaskPin {
        id: "p".into(),
        task_id: "t".into(),
        connector_kind: kind.into(),
        identity: identity.into(),
        payload,
        created_at: "2026-08-04T00:00:00Z".into(),
    };

    // chrome: a pinned tab that is closed gets appended; one already open does not duplicate.
    let captured = json!({"tabs": [{"url": "https://open.test/", "title": "Open"}]});
    let pins = vec![
        pin("chrome", "https://open.test/", json!({"url": "https://open.test/", "title": "Open"})),
        pin("chrome", "https://closed.test/", json!({"url": "https://closed.test/", "title": "Closed"})),
    ];
    let merged = merge_pins("chrome", &captured, &pins);
    let tabs = merged["tabs"].as_array().unwrap();
    assert_eq!(tabs.len(), 2, "expected the closed pin appended once: {tabs:?}");
    assert_eq!(tabs[0]["url"], "https://open.test/", "captured order comes first");
    assert_eq!(tabs[1]["url"], "https://closed.test/");

    // vscode: openFiles is a bare string array.
    let captured = json!({"workspaceFolder": "/repo", "openFiles": ["/repo/a.ts"], "activeFile": null, "terminals": []});
    let pins = vec![pin("vscode", "/repo/b.ts", json!("/repo/b.ts"))];
    let merged = merge_pins("vscode", &captured, &pins);
    assert_eq!(
        merged["openFiles"].as_array().unwrap(),
        &vec![json!("/repo/a.ts"), json!("/repo/b.ts")]
    );

    // terminal identity is name + NUL + cwd, so two terminals named the same in
    // different directories are different items.
    let a = json!({"name": "zsh", "cwd": "/repo/a"});
    let b = json!({"name": "zsh", "cwd": "/repo/b"});
    assert_ne!(identity_of("vscode", &a), identity_of("vscode", &b));
    assert_eq!(identity_of("chrome", &json!({"url": "https://x.test/"})), Some("https://x.test/".to_string()));
    assert_eq!(identity_of("chrome", &json!({"no": "url"})), None);
}
```

The names are counterintuitive and verified: the directory is `crates/omnibus-db` but the package is **`rabta-db`**, imported as `rabta_db`. The desktop crate is `rabta-desktop` but its test-facing library is **`rabta_desktop_lib`**. `tests/capsules.rs` already imports both that way.

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p rabta-desktop --test capsules merge_pins_appends_missing_and_never_duplicates`
Expected: FAIL — `merge_pins` not found.

- [ ] **Step 3: Implement identity and merge**

In `apps/desktop/src-tauri/src/capsules.rs`:

```rust
/// What makes an item the same item across two captures. A tab is its URL, a
/// file is its path, and a terminal is its name and directory together —
/// two shells both called "zsh" in different folders are different terminals.
/// NUL is the separator because it cannot occur in either field.
pub fn identity_of(kind: &str, item: &Value) -> Option<String> {
    match kind {
        "chrome" => item.get("url")?.as_str().map(str::to_string),
        "vscode" => {
            if let Some(path) = item.as_str() {
                return Some(path.to_string());
            }
            let name = item.get("name")?.as_str()?;
            let cwd = item.get("cwd").and_then(Value::as_str).unwrap_or("");
            Some(format!("{name}\0{cwd}"))
        }
        _ => None,
    }
}

/// The captured payload plus any pinned item that is not already in it.
/// Captured order is preserved and pins are appended, so restore opens what
/// was open first and the always-there items after.
pub fn merge_pins(kind: &str, captured: &Value, pins: &[TaskPin]) -> Value {
    let field = match kind {
        "chrome" => "tabs",
        "vscode" => "openFiles",
        _ => return captured.clone(),
    };
    let mut out = captured.clone();
    let mut items = captured
        .get(field)
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut seen: std::collections::HashSet<String> = items
        .iter()
        .filter_map(|i| identity_of(kind, i))
        .collect();

    for p in pins.iter().filter(|p| p.connector_kind == kind) {
        // A vscode terminal pin belongs to `terminals`, not `openFiles`.
        let is_terminal = kind == "vscode" && p.payload.get("name").is_some();
        if is_terminal {
            continue;
        }
        if seen.insert(p.identity.clone()) {
            items.push(p.payload.clone());
        }
    }
    out[field] = Value::Array(items);

    if kind == "vscode" {
        let mut terms = captured
            .get("terminals")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let mut tseen: std::collections::HashSet<String> = terms
            .iter()
            .filter_map(|i| identity_of(kind, i))
            .collect();
        for p in pins
            .iter()
            .filter(|p| p.connector_kind == kind && p.payload.get("name").is_some())
        {
            if tseen.insert(p.identity.clone()) {
                terms.push(p.payload.clone());
            }
        }
        out["terminals"] = Value::Array(terms);
    }
    out
}
```

Add `use rabta_db::TaskPin;` to the file's imports if it is not already there.

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p rabta-desktop --test capsules merge_pins_appends_missing_and_never_duplicates`
Expected: PASS.

- [ ] **Step 5: Call the merge in the restore path**

In `apps/desktop/src-tauri/src/capsules.rs`, in the function that reads a task's resources before applying them (the one feeding `restore_chrome` and the vscode restore), load pins once and merge each payload before it is applied:

```rust
        let pins = {
            let db = self.db.clone();
            let tid = task_id.to_string();
            tokio::task::spawn_blocking(move || db.task_pins(&tid))
                .await
                .map_err(|e| e.to_string())?
                .map_err(|e| e.to_string())?
        };
```

Then, where each resource's `payload` is currently passed to the per-kind restore, pass `&merge_pins(&resource.connector_kind, &resource.payload, &pins)` instead.

- [ ] **Step 6: Write the rule's own test**

Add to `apps/desktop/src-tauri/tests/capsules.rs`. This is the test the whole feature rests on — read the file's existing harness (how it builds a `Capsules` with a fake connector and asserts on received command names) and follow it exactly:

```rust
#[tokio::test]
async fn a_pinned_tab_reopens_after_being_closed_and_saved_over() {
    // The rule: pins survive auto-save. Pin a tab, close it, save the capsule
    // (so the captured payload no longer contains it), then activate — it must
    // still be opened. If this fails, a pin means "until I close it once".
    let h = harness().await;
    h.db.add_task_pin(&h.task_id, "chrome", "https://pinned.test/",
        &serde_json::json!({"url": "https://pinned.test/", "title": "Pinned"})).unwrap();

    h.set_connector_state("chrome", serde_json::json!({"tabs": []})).await;
    h.capsules.save_capsule(&h.task_id).await.unwrap();

    h.clear_received().await;
    h.capsules.activate(&h.task_id).await.unwrap();

    let names = h.received().await;
    assert!(
        names.iter().any(|(n, a)| n == "tabs.open" && a["url"] == "https://pinned.test/"),
        "pinned tab was not reopened: {names:?}"
    );
}
```

Adapt the harness calls to whatever `tests/capsules.rs` already provides. Do not build a second harness.

- [ ] **Step 7: Run the tests**

Run: `cargo test -p rabta-desktop --test capsules`
Expected: all pass, including the two new tests.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src-tauri/src/capsules.rs apps/desktop/src-tauri/tests/capsules.rs
git commit -m "feat(capsules): merge pins into restore

Restore now opens the union of what was captured and what was pinned, deduped
by identity. A pinned tab that was closed before the last save still opens,
which is the difference between 'always here' and 'here until I close it once'."
```

---

### Task 3: Tauri commands for pinning and removing

**Files:**
- Modify: `apps/desktop/src-tauri/src/lib.rs` (three commands + registration in `generate_handler!`)
- Test: `apps/desktop/src-tauri/tests/capsules.rs`

**Interfaces:**
- Consumes: `Db::add_task_pin`, `Db::remove_task_pin`, `Db::task_pins`, `capsules::identity_of` from Tasks 1–2.
- Produces three Tauri commands, called from TS as:
  - `invoke("pin_task_item", { taskId, connectorKind, payload })` → `void`
  - `invoke("unpin_task_item", { taskId, connectorKind, identity })` → `boolean`
  - `invoke("remove_task_item", { taskId, connectorKind, identity })` → `void` — removes the item from the captured payload; does not touch pins.

- [ ] **Step 1: Write the failing test**

Add to `apps/desktop/src-tauri/tests/capsules.rs`:

```rust
#[tokio::test]
async fn removing_a_captured_item_leaves_pins_alone() {
    let h = harness().await;
    h.set_connector_state("chrome", serde_json::json!({
        "tabs": [{"url": "https://keep.test/", "title": "Keep"},
                 {"url": "https://drop.test/", "title": "Drop"}]
    })).await;
    h.capsules.save_capsule(&h.task_id).await.unwrap();
    h.db.add_task_pin(&h.task_id, "chrome", "https://drop.test/",
        &serde_json::json!({"url": "https://drop.test/", "title": "Drop"})).unwrap();

    h.capsules.remove_captured_item(&h.task_id, "chrome", "https://drop.test/").await.unwrap();

    let res = h.db.task_resources(&h.task_id).unwrap();
    let tabs = res.iter().find(|r| r.connector_kind == "chrome").unwrap().payload["tabs"]
        .as_array().unwrap().clone();
    assert_eq!(tabs.len(), 1, "captured item should be gone: {tabs:?}");
    assert_eq!(tabs[0]["url"], "https://keep.test/");
    assert_eq!(h.db.task_pins(&h.task_id).unwrap().len(), 1, "removing a record must not unpin");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p rabta-desktop --test capsules removing_a_captured_item_leaves_pins_alone`
Expected: FAIL — no method `remove_captured_item`.

- [ ] **Step 3: Implement `remove_captured_item` on `Capsules`**

In `apps/desktop/src-tauri/src/capsules.rs`:

```rust
    /// Drops one item from a task's captured payload. Deliberately does not
    /// touch pins: deleting the record of a thing and saying "never open this"
    /// are different requests, and only the first one exists in phase 1.
    pub async fn remove_captured_item(
        &self,
        task_id: &str,
        kind: &str,
        identity: &str,
    ) -> Result<(), String> {
        let db = self.db.clone();
        let (tid, k, id) = (task_id.to_string(), kind.to_string(), identity.to_string());
        tokio::task::spawn_blocking(move || -> Result<(), String> {
            let resources = db.task_resources(&tid).map_err(|e| e.to_string())?;
            let Some(r) = resources.iter().find(|r| r.connector_kind == k) else {
                return Ok(());
            };
            let mut payload = r.payload.clone();
            for field in ["tabs", "openFiles", "terminals"] {
                if let Some(arr) = payload.get_mut(field).and_then(Value::as_array_mut) {
                    arr.retain(|item| identity_of(&k, item).as_deref() != Some(id.as_str()));
                }
            }
            db.replace_task_resources(&tid, &k, "workspace", &payload)
                .map_err(|e| e.to_string())?;
            Ok(())
        })
        .await
        .map_err(|e| e.to_string())?
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p rabta-desktop --test capsules removing_a_captured_item_leaves_pins_alone`
Expected: PASS.

- [ ] **Step 5: Add the three Tauri commands**

In `apps/desktop/src-tauri/src/lib.rs`, next to the other capsule commands:

```rust
#[tauri::command]
async fn pin_task_item(
    task_id: String,
    connector_kind: String,
    payload: serde_json::Value,
    db: State<'_, DbHandle>,
) -> Result<(), String> {
    let identity = crate::capsules::identity_of(&connector_kind, &payload)
        .ok_or_else(|| format!("cannot identify a {connector_kind} item from {payload}"))?;
    let db = db.0.clone();
    tokio::task::spawn_blocking(move || db.add_task_pin(&task_id, &connector_kind, &identity, &payload))
        .await
        .map_err(|e| e.to_string())?
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn unpin_task_item(
    task_id: String,
    connector_kind: String,
    identity: String,
    db: State<'_, DbHandle>,
) -> Result<bool, String> {
    let db = db.0.clone();
    tokio::task::spawn_blocking(move || db.remove_task_pin(&task_id, &connector_kind, &identity))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn remove_task_item(
    task_id: String,
    connector_kind: String,
    identity: String,
    capsules: State<'_, CapsulesHandle>,
) -> Result<(), String> {
    capsules.0.remove_captured_item(&task_id, &connector_kind, &identity).await
}

/// Read side for the curate UI: which items this task has pinned.
#[tauri::command]
async fn task_pins(task_id: String, db: State<'_, DbHandle>) -> Result<Vec<TaskPin>, String> {
    let db = db.0.clone();
    tokio::task::spawn_blocking(move || db.task_pins(&task_id))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}
```

Add `use rabta_db::TaskPin;` to `lib.rs` if it is not already imported, and re-export it from the db crate's `lib.rs` (`pub use records::{… TaskPin …}`) — Task 1 deliberately scoped its `lib.rs` edit to the `MIGRATIONS` array, so the type is not yet visible outside `rabta-db`.

`TaskPin` carries `#[serde(rename_all = "camelCase")]` like every sibling record type, so the TS side receives `{ id, taskId, connectorKind, identity, payload, createdAt }`. Task 4 depends on that exact casing.

Use whatever the file's existing capsule commands use for the DB and `Capsules` state types — read one of them first and copy its `State<'_, …>` parameter exactly rather than assuming `DbHandle` / `CapsulesHandle`.

Register all three in `generate_handler!`:

```rust
            pin_task_item,
            unpin_task_item,
            remove_task_item,
            task_pins,
```

- [ ] **Step 6: Build and run the suite**

Run: `cargo test -p rabta-desktop`
Expected: compiles and all tests pass. A command missing from `generate_handler!` still compiles, so confirm by grepping:

Run: `grep -c "pin_task_item\|unpin_task_item\|remove_task_item\|fn task_pins\|            task_pins," apps/desktop/src-tauri/src/lib.rs`
Expected: `8` — four definitions and four registrations.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src-tauri/src/lib.rs apps/desktop/src-tauri/src/capsules.rs apps/desktop/src-tauri/tests/capsules.rs
git commit -m "feat(capsules): pin, unpin and remove commands

Removing a captured item does not unpin it: deleting the record of a thing and
saying never open this are different requests, and only the first exists yet."
```

---

### Task 4: The curate UI

**Files:**
- Create: `apps/desktop/src/features/capsules/CapsuleItems.tsx`
- Create: `apps/desktop/src/features/capsules/CapsuleItems.test.tsx`
- Modify: `apps/desktop/src/pages/CapsulesPage.tsx` (render `<CapsuleItems>` in the existing per-task capsule popover)

**Interfaces:**
- Consumes: the three Tauri commands from Task 3.
- Produces: `export function CapsuleItems({ taskId, resources, pins, onChanged }: CapsuleItemsProps)`, where

```ts
export interface CapsuleItem {
  kind: "chrome" | "vscode";
  identity: string;
  label: string;
  payload: unknown;
  pinned: boolean;
}

export interface CapsuleItemsProps {
  taskId: string;
  resources: TaskResource[];
  /** Straight from the `task_pins` command; camelCase, like every other record type. */
  pins: { connectorKind: string; identity: string }[];
  onChanged: () => void;
}
```

A new file rather than more lines in `CapsulesPage.tsx`, which is already 739 lines.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/features/capsules/CapsuleItems.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CapsuleItems } from "./CapsuleItems";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

const resources = [
  {
    connectorKind: "chrome",
    payload: { tabs: [{ url: "https://a.test/", title: "Alpha" }] },
  },
] as never;

beforeEach(() => invoke.mockReset().mockResolvedValue(undefined));

describe("CapsuleItems", () => {
  it("pins an unpinned item", async () => {
    const onChanged = vi.fn();
    render(<CapsuleItems taskId="t1" resources={resources} pins={[]} onChanged={onChanged} />);

    await userEvent.click(screen.getByRole("button", { name: /always open Alpha/i }));

    expect(invoke).toHaveBeenCalledWith("pin_task_item", {
      taskId: "t1",
      connectorKind: "chrome",
      payload: { url: "https://a.test/", title: "Alpha" },
    });
    expect(onChanged).toHaveBeenCalled();
  });

  it("unpins an already-pinned item", async () => {
    render(
      <CapsuleItems
        taskId="t1"
        resources={resources}
        pins={[{ connectorKind: "chrome", identity: "https://a.test/" }]}
        onChanged={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /stop always opening Alpha/i }));

    expect(invoke).toHaveBeenCalledWith("unpin_task_item", {
      taskId: "t1",
      connectorKind: "chrome",
      identity: "https://a.test/",
    });
  });

  it("removes an item from the capsule", async () => {
    render(<CapsuleItems taskId="t1" resources={resources} pins={[]} onChanged={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: /remove Alpha from this capsule/i }));

    expect(invoke).toHaveBeenCalledWith("remove_task_item", {
      taskId: "t1",
      connectorKind: "chrome",
      identity: "https://a.test/",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter desktop test CapsuleItems`
Expected: FAIL — cannot resolve `./CapsuleItems`.

- [ ] **Step 3: Write the component**

Create `apps/desktop/src/features/capsules/CapsuleItems.tsx`:

```tsx
import { invoke } from "@tauri-apps/api/core";
import { Pin, PinOff, X } from "lucide-react";
import { toastErr } from "@/lib/toast";

export interface CapsuleItem {
  kind: "chrome" | "vscode";
  identity: string;
  label: string;
  payload: unknown;
  pinned: boolean;
}

export interface CapsuleItemsProps {
  taskId: string;
  /** The store's TaskResource. camelCase — the Rust struct carries
   *  serde(rename_all = "camelCase") like every other record type. */
  resources: { connectorKind: string; payload: Record<string, unknown> }[];
  /** Straight from the `task_pins` command; camelCase, like every other record type. */
  pins: { connectorKind: string; identity: string }[];
  onChanged: () => void;
}

/** Identity must match capsules::identity_of in the Rust side exactly — a tab
 *  is its url, a file is its path, a terminal is name + NUL + cwd. If these two
 *  ever disagree, pinning silently stops matching what was captured. */
function identityOf(kind: string, item: unknown): string | null {
  if (kind === "chrome") {
    const url = (item as { url?: string })?.url;
    return typeof url === "string" ? url : null;
  }
  if (typeof item === "string") return item;
  const t = item as { name?: string; cwd?: string | null };
  return typeof t?.name === "string" ? `${t.name}\0${t.cwd ?? ""}` : null;
}

function itemsOf(
  resources: CapsuleItemsProps["resources"],
  pins: CapsuleItemsProps["pins"],
): CapsuleItem[] {
  const pinned = new Set(pins.map((p) => `${p.connectorKind}${p.identity}`));
  const out: CapsuleItem[] = [];
  for (const r of resources) {
    const kind = r.connectorKind;
    if (kind !== "chrome" && kind !== "vscode") continue;
    const groups: unknown[] = [
      ...((r.payload.tabs as unknown[]) ?? []),
      ...((r.payload.openFiles as unknown[]) ?? []),
      ...((r.payload.terminals as unknown[]) ?? []),
    ];
    for (const item of groups) {
      const identity = identityOf(kind, item);
      if (!identity) continue;
      const label =
        (item as { title?: string })?.title ??
        (item as { name?: string })?.name ??
        (typeof item === "string" ? item.split("/").pop() ?? item : identity);
      out.push({
        kind,
        identity,
        label,
        payload: item,
        pinned: pinned.has(`${kind}${identity}`),
      });
    }
  }
  return out;
}

export function CapsuleItems({ taskId, resources, pins, onChanged }: CapsuleItemsProps) {
  const items = itemsOf(resources, pins);
  if (items.length === 0) return null;

  async function run(cmd: string, args: Record<string, unknown>) {
    try {
      await invoke(cmd, args);
      onChanged();
    } catch (e) {
      toastErr(e);
    }
  }

  return (
    <ul className="flex flex-col gap-1">
      {items.map((it) => (
        <li key={`${it.kind}${it.identity}`} className="flex items-center gap-2 text-sm">
          <span className="truncate flex-1" title={it.identity}>
            {it.label}
          </span>
          <button
            type="button"
            aria-label={
              it.pinned ? `stop always opening ${it.label}` : `always open ${it.label}`
            }
            onClick={() =>
              it.pinned
                ? run("unpin_task_item", {
                    taskId,
                    connectorKind: it.kind,
                    identity: it.identity,
                  })
                : run("pin_task_item", {
                    taskId,
                    connectorKind: it.kind,
                    payload: it.payload,
                  })
            }
          >
            {it.pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />}
          </button>
          <button
            type="button"
            aria-label={`remove ${it.label} from this capsule`}
            onClick={() =>
              run("remove_task_item", {
                taskId,
                connectorKind: it.kind,
                identity: it.identity,
              })
            }
          >
            <X aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}
```

Check that `lucide-react` and `@/lib/toast` are what this codebase already uses for icons and error toasts — `apps/desktop/src/lib/capsule.ts` imports `toastErr` from `@/lib/toast`, so that one is confirmed. If icons come from somewhere else, use that instead. Match the styling approach of the surrounding components rather than inventing classes.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter desktop test CapsuleItems`
Expected: PASS, 3 tests.

- [ ] **Step 5: Render it in the capsule popover**

In `apps/desktop/src/pages/CapsulesPage.tsx`, inside the existing per-task capsule popover (the component around line 125–150 that already receives `resources`), render:

```tsx
<CapsuleItems
  taskId={task.id}
  resources={resources}
  pins={pins}
  onChanged={refreshResources}
/>
```

Load pins alongside resources with `invoke<{ connectorKind: string; identity: string }[]>("task_pins", { taskId })` — Task 3 created that command. Reuse whatever the page already calls to refresh resources for `onChanged`.

- [ ] **Step 6: Run the full desktop suite**

Run: `pnpm --filter desktop test`
Expected: all pass, including the existing `CapsulesPage.test.tsx`.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/features/capsules/ apps/desktop/src/pages/CapsulesPage.tsx apps/desktop/src-tauri/src/lib.rs
git commit -m "feat(capsules): curate a capsule's items

Pin an item to have it open every resume, or remove it from the record. Its own
component rather than more lines in CapsulesPage, which is already 739."
```

---

### Task 5: Prove the guarantee, and document it

**Files:**
- Test: `apps/desktop/src-tauri/tests/capsules.rs`
- Modify: `README.md` (the capsule section)

**Interfaces:**
- Consumes: everything above.
- Produces: nothing new — this task exists so the phase cannot be called done on an untested promise.

- [ ] **Step 1: Write the no-regression test**

Add to `apps/desktop/src-tauri/tests/capsules.rs`:

```rust
#[tokio::test]
async fn a_task_with_no_pins_restores_exactly_as_before() {
    // Phase 1 adds a layer; it must not move anything underneath it. A task
    // that has never been curated has to issue the identical command sequence.
    let h = harness().await;
    h.set_connector_state("chrome", serde_json::json!({
        "tabs": [{"url": "https://a.test/", "title": "A"}, {"url": "https://b.test/", "title": "B"}]
    })).await;
    h.capsules.save_capsule(&h.task_id).await.unwrap();
    h.clear_received().await;

    h.capsules.activate(&h.task_id).await.unwrap();

    let opened: Vec<String> = h.received().await.into_iter()
        .filter(|(n, _)| n == "tabs.open")
        .map(|(_, a)| a["url"].as_str().unwrap().to_string())
        .collect();
    assert_eq!(opened, vec!["https://a.test/", "https://b.test/"],
        "an uncurated task must restore exactly what it captured, in order");
}
```

- [ ] **Step 2: Run the whole suite**

Run: `cargo test -p rabta-desktop && cargo test -p rabta-db && pnpm --filter desktop test`
Expected: everything passes.

- [ ] **Step 3: Document what a pin means**

In `README.md`, in the section describing capsules, add:

```markdown
Items in a capsule can be **pinned**. A pinned item opens every time you resume
the task, even if it was closed when you last saved — that is the difference
between "always here" and "here until I close it once". Everything else in a
capsule is simply what was open, and comes back as it was.
```

Do not claim anything about closing, hiding or swapping. That is Phase 2 and does not exist yet.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src-tauri/tests/capsules.rs README.md
git commit -m "test(capsules): an uncurated task restores exactly as before

Phase 1 adds a layer and must not move what is underneath it."
```

---

## Done when

- `cargo test -p rabta-db`, `cargo test -p rabta-desktop` and `pnpm --filter desktop test` all pass.
- A pinned tab that was closed before the last save still opens on resume.
- A task with no pins issues the identical command sequence it did before.
- Nothing under `connectors/` changed, and no extension version was bumped.

## Not in this plan

Phase 2 — `focusMode`, the reconcile step, the guards, the receipt fields, `tabs.close`, `editor.closeFile`, `terminal.dispose`, and the VS Code 1.93 floor. It gets its own plan once Phase 1 has landed and the data model has met real use.
