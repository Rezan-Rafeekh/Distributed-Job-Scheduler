import { createContext, useContext, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api, clearTokens, setTokens } from "./apiClient.js";

interface AuthUser {
  id: string;
  email: string;
}

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

interface AuthContextValue {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem("user");
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  });
  const navigate = useNavigate();

  function persist(res: AuthResponse) {
    setTokens(res.accessToken, res.refreshToken);
    localStorage.setItem("user", JSON.stringify(res.user));
    setUser(res.user);
  }

  async function login(email: string, password: string) {
    persist(await api.post<AuthResponse>("/auth/login", { email, password }));
    navigate("/orgs");
  }

  async function register(email: string, password: string, name: string) {
    persist(await api.post<AuthResponse>("/auth/register", { email, password, name }));
    navigate("/orgs");
  }

  function logout() {
    clearTokens();
    localStorage.removeItem("user");
    setUser(null);
    navigate("/login");
  }

  return <AuthContext.Provider value={{ user, login, register, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
