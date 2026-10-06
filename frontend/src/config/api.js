// API Configuration
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Helper function for API calls
export const apiUrl = (endpoint) => `${API_BASE_URL}${endpoint}`;
