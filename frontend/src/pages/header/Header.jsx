import React, { useEffect, useState } from "react";
import { Container, Nav, Navbar, Button } from "react-bootstrap";
import { useLocation, Link, useNavigate } from "react-router-dom";
import { getAuth, signOut } from "firebase/auth";
import logo from "../../assets/logo.png";

const Header = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const auth = getAuth();

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [role, setRole] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const storedRole = localStorage.getItem("role");

    setIsLoggedIn(Boolean(token));
    setRole(storedRole);
  }, [location]);

  // 🔥 Helper to hide nav links during onboarding/pending states
  const isRestrictedState = 
    location.pathname === "/complete-profile" || 
    location.pathname === "/pending-approval";

  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.clear();
      setIsLoggedIn(false);
      navigate("/login");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const getDashboardPath = () => {
    if (role === "admin") return "/admin/approval";
    return "/supervisor/dashboard";
  };

  return (
    <Navbar bg="dark" variant="dark" expand="lg">
      <Container fluid>
        <Navbar.Brand as={Link} to="/home">
          <img
            src={logo}
            alt="Logo"
            width="30"
            height="30"
            className="d-inline-block align-top me-2"
          />
          WANA
          {!import.meta.env.PROD && (
            <span
              className="badge bg-warning text-dark ms-2 text-uppercase"
              style={{ fontSize: "0.65rem", verticalAlign: "middle" }}
            >
              {import.meta.env.MODE || "DEV"}
            </span>
          )}
        </Navbar.Brand>

        <Navbar.Toggle aria-controls="basic-navbar-nav" />
        <Navbar.Collapse id="basic-navbar-nav">
          <Nav className="me-auto">
            <Nav.Link as={Link} to="/home">Home</Nav.Link>

            {/* Accessible when logged in or in dev preview */}
            {!isRestrictedState && (isLoggedIn || !import.meta.env.PROD) && (
              <>
                <Nav.Link as={Link} to={getDashboardPath()}>
                  Dashboard
                </Nav.Link>
                
                {/* Supervisor-specific navigation */}
                {(role === "supervisor" || !role || !import.meta.env.PROD) && (
                  <>
                    <Nav.Link as={Link} to="/supervisor/ongoing-events">
                      Ongoing Events
                    </Nav.Link>
                    <Nav.Link as={Link} to="/supervisor/acceptors">
                      Acceptors
                    </Nav.Link>
                    <Nav.Link as={Link} to="/supervisor/history">
                      History
                    </Nav.Link>
                  </>
                )}

                {role === "admin" && (
                  <>
                    <Nav.Link as={Link} to="/admin/approval">
                      Approvals
                    </Nav.Link>
                    <Nav.Link as={Link} to="/admin/logs">
                      Logs
                    </Nav.Link>
                  </>
                )}
              </>
            )}
          </Nav>

          <Nav>
            {!isLoggedIn ? (
              <>
                <Nav.Link as={Link} to="/login">Login</Nav.Link>
                <Nav.Link as={Link} to="/register" className="btn btn-primary text-white ms-lg-2 px-3">
                  Sign Up
                </Nav.Link>
              </>
            ) : (
              // Explicitly styled Logout button that works even in restricted states
              <Button 
                variant="outline-light" 
                size="sm" 
                className="ms-lg-3"
                onClick={handleLogout}
              >
                Logout
              </Button>
            )}
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
};

export default Header;