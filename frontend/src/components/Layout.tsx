import { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import ChatWidget from "./ChatWidget";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/violations", label: "Violations" },
  { to: "/zones", label: "Zones" },
  { to: "/vehicles", label: "Vehicles" },
  { to: "/incidents", label: "Incidents" },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">V</div>
          <span>VeloSafe</span>
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-chip">
            <div className="user-avatar">{user?.display_name.charAt(0)}</div>
            <div>
              <div className="user-name">{user?.display_name}</div>
              <div className="user-role">{user?.role}</div>
            </div>
          </div>
          <button className="btn btn-ghost" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="main-content">{children}</main>

      <ChatWidget />
    </div>
  );
}
