'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchCurrentUser, logoutUser, type AuthUser } from "./api/auth";

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = async () => {
    setIsLoading(true);

    try {
      const response = await fetchCurrentUser();
      setUser(response.user);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refreshUser();
  }, []);

  const logout = async () => {
    await logoutUser();
    setUser(null);
  };

  const value = useMemo(() => ({ user, isLoading, refreshUser, logout }), [user, isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
