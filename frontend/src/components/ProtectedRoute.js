import { Navigate, useLocation } from "react-router-dom";
import { isAuthenticated, getRole } from "@/lib/api";

// routes that require a specific role; any route not listed here is open
// to any authenticated user (e.g. /records is shared by both roles).
const ROUTE_ROLES = {
  "/doctor": "doctor",
  "/secretary": "secretary",
};

const ProtectedRoute = ({ children }) => {
  const location = useLocation();

  if (!isAuthenticated()) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  const requiredRole = ROUTE_ROLES[location.pathname];
  const role = getRole();
  if (requiredRole && role !== requiredRole) {
    // Authenticated, but the wrong role for this specific page (e.g. a
    // secretary session hitting /doctor directly via the URL bar) — send
    // her to her own home page instead of rendering doctor-only UI.
    return <Navigate to={role === "doctor" ? "/doctor" : "/secretary"} replace />;
  }

  return children;
};

export default ProtectedRoute;

