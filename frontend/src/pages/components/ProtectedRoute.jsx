import React, { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { apiUrl } from "../../config/api";

/**
 * ProtectedRoute Component (FE-01)
 * Evaluates the full user lifecycle matrix:
 * 1. Unauthenticated -> /login
 * 2. Unverified email -> /verify-email (in prod)
 * 3. Status REJECTED -> /rejected
 * 4. Status SUSPENDED -> /suspended
 * 5. Unassigned region -> /complete-profile
 * 6. Status PENDING -> /pending-approval
 * 7. Role-restricted access
 */
const ProtectedRoute = ({ children, allowedRole }) => {
  const [loading, setLoading] = useState(true);
  const [userState, setUserState] = useState({
    isAuthenticated: false,
    emailVerified: false,
    role: null,
    region: null,
    status: null,
    rejectReason: null,
    isApproved: false,
  });

  const location = useLocation();
  const auth = getAuth();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const token = await user.getIdToken();

          // Query authoritative /auth/me
          const response = await fetch(apiUrl("/auth/me"), {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (response.ok) {
            const data = await response.json();
            setUserState({
              isAuthenticated: true,
              emailVerified: user.emailVerified,
              role: data.role,
              region: data.regionId || data.region,
              status: data.status,
              rejectReason: data.rejectReason || null,
              isApproved: data.status === "APPROVED" || data.isApproved === true,
            });
          } else {
            setUserState({
              isAuthenticated: true,
              emailVerified: user.emailVerified,
              role: null,
              region: null,
              status: "UNREGISTERED",
              isApproved: false,
            });
          }
        } catch (error) {
          console.error("Error verifying identity:", error);
          setUserState({ isAuthenticated: false });
        }
      } else {
        setUserState({ isAuthenticated: false });
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [auth]);

  if (loading) {
    return (
      <div className="vh-100 d-flex justify-content-center align-items-center">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Verifying Authorization...</span>
        </div>
      </div>
    );
  }

  // 1️⃣ GATE 1: Authentication
  if (!userState.isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 2️⃣ GATE 2: Email Verification (Enforced in production)
  if (!userState.emailVerified && location.pathname !== "/verify-email" && import.meta.env.PROD) {
    return <Navigate to="/verify-email" replace />;
  }

  // 3️⃣ GATE 3: Lifecycle States
  if (userState.status === "REJECTED" && location.pathname !== "/rejected") {
    return <Navigate to="/rejected" replace />;
  }

  if (userState.status === "SUSPENDED" && location.pathname !== "/suspended") {
    return <Navigate to="/suspended" replace />;
  }

  if (userState.role === "supervisor") {
    // If no region assigned yet
    if (!userState.region && location.pathname !== "/complete-profile") {
      return <Navigate to="/complete-profile" replace />;
    }

    // If pending approval
    if (userState.region && !userState.isApproved && location.pathname !== "/pending-approval") {
      return <Navigate to="/pending-approval" replace />;
    }

    // If approved, block onboarding pages
    const onboardingPages = ["/complete-profile", "/pending-approval", "/verify-email", "/rejected", "/suspended"];
    if (userState.isApproved && onboardingPages.includes(location.pathname)) {
      return <Navigate to="/supervisor/dashboard" replace />;
    }
  }

  // 4️⃣ GATE 4: Role Verification
  if (allowedRole && userState.role !== allowedRole) {
    return <Navigate to="/home" replace />;
  }

  return children;
};

export default ProtectedRoute;