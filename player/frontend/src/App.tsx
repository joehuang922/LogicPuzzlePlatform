import { Routes, Route, Link } from "react-router-dom";
import Home from "./pages/Home";
import Play from "./pages/Play";
import Sandbox from "./pages/Sandbox";
import Admin from "./pages/Admin";

export default function App() {
  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "2rem" }}>
      <h1>Logic Puzzle Platform</h1>
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
