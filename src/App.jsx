import { useState } from "react";
import "./App.css";
import Sales from "./pages/Sales";
import Timekeeping from "./pages/Timekeeping";
import Calendar from "./pages/Calendar";
import Board from "./pages/Board";

const NAV = [
  { id: "dashboard",   label: "Dashboard" },
  { id: "sales",       label: "Commissions" },
  { id: "timekeeping", label: "Timekeeping" },
  { id: "calendar",    label: "Calendar" },
  { id: "board",       label: "Board" },
];

function Placeholder({ name }) {
  return (
    <div className="page">
      <div className="page-header">
        <h1>{name}</h1>
      </div>
      <p className="empty-state">Coming soon.</p>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState("sales");

  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="sidebar-brand">
          <span className="sidebar-brand-name">glin</span>
          <span className="sidebar-brand-sub">studio</span>
        </div>
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
        {page === "sales"       && <Sales />}
        {page === "timekeeping" && <Timekeeping />}
        {page === "calendar"    && <Calendar />}
        {page === "board"       && <Board />}
      </main>
    </div>
  );
}
