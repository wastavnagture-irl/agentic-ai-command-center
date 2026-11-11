// Centralized API configuration for Agentic AI Command Center
export const BACKEND_URL = (
  import.meta.env.VITE_BACKEND_URL ||
  import.meta.env.VITE_API_URL ||
  "https://agentic-ai-command-center.onrender.com"
).replace(/\/$/, "");

export const API_ENDPOINTS = {
  EXECUTE: `${BACKEND_URL}/api/execute`,
  ROOT: `${BACKEND_URL}/`,
  DOCS: `${BACKEND_URL}/docs`,
};

export default {
  BACKEND_URL,
  API_ENDPOINTS,
};
