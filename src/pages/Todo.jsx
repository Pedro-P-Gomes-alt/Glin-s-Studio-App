import { useState, useEffect } from "react";
import { query, execute } from "../db";

// A simple scratch to-do list. Active tasks stick around (in the DB, so they
// survive restarts). Completed tasks linger — struck through — only until she
// leaves the tab or reopens the app, then they're swept away:
//   • leaving the tab unmounts this component → cleanup deletes done rows.
//   • reopening the app → the load purges any done rows left from last session.
export default function Todo() {
  const [todos, setTodos] = useState([]);
  const [text, setText]   = useState("");

  useEffect(() => {
    // Purge anything completed before the app was last closed, then load.
    execute(`DELETE FROM todos WHERE done = 1`).then(load);
    // On unmount (switching tabs), sweep away completed tasks.
    return () => { execute(`DELETE FROM todos WHERE done = 1`); };
  }, []);

  async function load() {
    setTodos(await query(`SELECT * FROM todos ORDER BY done, id`));
  }

  async function addTodo(e) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    await execute(`INSERT INTO todos (text) VALUES (?)`, [t]);
    setText("");
    await load();
  }

  async function toggle(todo) {
    await execute(`UPDATE todos SET done = ? WHERE id = ?`, [todo.done ? 0 : 1, todo.id]);
    await load();
  }

  async function remove(id) {
    await execute(`DELETE FROM todos WHERE id = ?`, [id]);
    await load();
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>To-Do</h1>
      </div>

      <p className="page-hint" style={{ marginBottom: 16 }}>
        A quick scratch list. Completed tasks disappear when you leave this tab or close the app.
      </p>

      <form className="todo-add" onSubmit={addTodo}
        style={{ display: "flex", gap: 8, marginBottom: 20, maxWidth: 560 }}>
        <input
          style={{ flex: 1 }}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Add a task…"
          autoFocus
        />
        <button type="submit" className="btn-primary">Add</button>
      </form>

      {todos.length === 0 ? (
        <p className="empty-state">Nothing on the list. Add a task above.</p>
      ) : (
        <ul className="todo-list" style={{ listStyle: "none", padding: 0, margin: 0, maxWidth: 560 }}>
          {todos.map(t => (
            <li key={t.id} className={`todo-row${t.done ? " is-done" : ""}`}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px", marginBottom: 6,
                border: "1px solid var(--border)", borderRadius: "8px",
                background: "var(--surface)",
              }}>
              <button className="todo-check" onClick={() => toggle(t)}
                title={t.done ? "Mark not done" : "Mark done"}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.1em", padding: 0 }}>
                {t.done ? "☑" : "☐"}
              </button>
              <span style={{
                flex: 1,
                textDecoration: t.done ? "line-through" : "none",
                opacity: t.done ? 0.5 : 1,
              }}>
                {t.text}
              </span>
              <button className="btn-icon" onClick={() => remove(t.id)} title="Delete">✕</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
