import { useState } from "react";
import "./App.css";

const NAV = [
  { id: "dashboard",   label: "Dashboard" },
  { id: "sales",       label: "Sales" },
  { id: "timekeeping", label: "Timekeeping" },
  { id: "calendar",    label: "Calendar" },
  { id: "board",       label: "Board" },
];

function Placeholder({ name }) {
  return (
    <div className="placeholder">
      <h2>{name}</h2>
      <p>Coming soon.</p>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState("dashboard");

  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="sidebar-brand">Glin's Studio</div>
        <ul>
          {NAV.map((n) => (
            <li key={n.id}>
              <button
                className={page === n.id ? "active" : ""}
                onClick={() => setPage(n.id)}
              >
                {n.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <main className="content">
        {page === "dashboard"   && <Placeholder name="Dashboard" />}
        {page === "sales"       && <Placeholder name="Sales" />}
        {page === "timekeeping" && <Placeholder name="Timekeeping" />}
        {page === "calendar"    && <Placeholder name="Calendar" />}
        {page === "board"       && <Placeholder name="Board" />}
      </main>
    </div>
  );
}
