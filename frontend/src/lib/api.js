import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";
export const API = `${BACKEND_URL}/api/v1`;

const apiClient = axios.create({ baseURL: API });

// Attach the JWT as a Bearer token on every request (sessionStorage,
// not localStorage: it is cleared automatically when the tab is closed,
// which limits the damage window if the device is shared/stolen).
apiClient.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("clinic_token");
  if (token) config.headers["Authorization"] = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      sessionStorage.removeItem("clinic_token");
      sessionStorage.removeItem("clinic_role");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

export default apiClient;

// Returns { success, access_token, token_type, role, message }
export const verifyPin = async (pin) => {
  const { data } = await axios.post(`${API}/login`, { pin });
  return data;
};

export const changePin = async (currentPin, newPin) => {
  // Uses apiClient (not raw axios) so the Bearer token required by the
  // new backend is attached automatically.
  const { data } = await apiClient.post(`/change-pin`, {
    current_pin: currentPin,
    new_pin: newPin,
  });
  return data;
};

export const isAuthenticated = () => !!sessionStorage.getItem("clinic_token");
export const getToken = () => sessionStorage.getItem("clinic_token");
export const getRole = () => sessionStorage.getItem("clinic_role");

export const setSession = (token, role) => {
  sessionStorage.setItem("clinic_token", token);
  sessionStorage.setItem("clinic_role", role);
};

export const logout = () => {
  sessionStorage.removeItem("clinic_token");
  sessionStorage.removeItem("clinic_role");
};

export const getWsUrl = () => {
  const token = getToken();
  if (!token) return null;
  let base = BACKEND_URL || window.location.origin;
  base = base.replace(/^http/, "ws");
  return `${base}/ws/updates?token=${encodeURIComponent(token)}`;
};
