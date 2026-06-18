use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "initial schema",
            sql: include_str!("../migrations/001_initial.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add shipped column",
            sql: include_str!("../migrations/002_add_shipped.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add delivered column",
            sql: include_str!("../migrations/003_add_delivered.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add shipped_at and pronouns",
            sql: include_str!("../migrations/004_shipped_at_pronouns.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "quotes table",
            sql: include_str!("../migrations/005_quotes.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "personal projects and payments",
            sql: include_str!("../migrations/006_personal_payments.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::new()
                .add_migrations("sqlite:glins_studio.db", migrations)
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
