import CovalentAvatar from "./CovalentAvatar";
import AdminPanel from "./AdminPanel";

export default function App() {
  const path = (typeof window !== "undefined" ? window.location.pathname : "/").toLowerCase();
  if (path === "/admin" || path.startsWith("/admin/")) {
    return <AdminPanel />;
  }
  return <CovalentAvatar />;
}
