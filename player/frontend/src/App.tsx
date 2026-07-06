import { Routes, Route, Link } from "react-router-dom";
import Home from "./pages/Home";
import Play from "./pages/Play";
import Sandbox from "./pages/Sandbox";
import Admin from "./pages/Admin";
import { useIsMobile } from "./hooks/useIsMobile";

export default function App() {
  const isMobile = useIsMobile();
  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: isMobile ? "1rem" : "2rem" }}>
      <h1 style={{ fontSize: isMobile ? "1.4rem" : undefined }}>Logic Puzzle Platform</h1>
      <nav style={{ marginBottom: "1.5rem" }}>
        <Link to="/">Home</Link> | <Link to="/admin">Admin</Link>
      </nav>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/play/:id" element={<Play />} />
        <Route path="/sandbox" element={<Sandbox />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </div>
  );
}
