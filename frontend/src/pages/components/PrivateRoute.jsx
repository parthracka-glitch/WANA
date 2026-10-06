import React, { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../firebase/firebaseConfig'; // Import auth from your config

const PrivateRoute = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      // Check if user exists AND if their email is verified
      if (currentUser && currentUser.emailVerified) {
        setUser(currentUser);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe(); // Cleanup the listener on component unmount
  }, []);

  if (loading) {
    return <div>Loading...</div>; // Optional: Add a spinner or loading message
  }

  // If the user is authenticated and verified, allow access to the route
  // Otherwise, redirect them to the login page
  return user ? <Outlet /> : <Navigate to="/login" replace />;
};

export default PrivateRoute;