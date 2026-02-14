"use client";

import { createContext, useContext, useEffect, useState, useCallback, useMemo, ReactNode } from "react";
import { UserProfile, DbUser } from "@/types";
import { initLiff, getLiffProfile, liffLogin, getLiff } from "@/lib/liff";
import { getRandomEmoji } from "@/lib/mockData";

interface LiffContextType {
  isReady: boolean;
  isLiffMode: boolean;
  user: UserProfile | null;
  dbUser: DbUser | null;
  setUser: (user: UserProfile | null) => void;
  setDbUser: (user: DbUser | null) => void;
  login: () => void;
  logout: () => void;
}

const LiffContext = createContext<LiffContextType>({
  isReady: false,
  isLiffMode: false,
  user: null,
  dbUser: null,
  setUser: () => {},
  setDbUser: () => {},
  login: () => {},
  logout: () => {},
});

export function useLiff() {
  return useContext(LiffContext);
}

const STORAGE_KEY = "triangle_user";

function loadUser(): UserProfile | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  }
  return null;
}

function saveUser(user: UserProfile | null) {
  if (typeof window === "undefined") return;
  if (user) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export default function LiffProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [isLiffMode, setIsLiffMode] = useState(false);
  const [user, setUserState] = useState<UserProfile | null>(null);
  const [dbUser, setDbUserState] = useState<DbUser | null>(null);

  useEffect(() => {
    const stored = loadUser();
    if (stored) setUserState(stored);

    initLiff().then(async (liffReady) => {
      setIsLiffMode(liffReady);
      if (liffReady) {
        const liffInstance = getLiff();
        if (liffInstance && (liffInstance.isInClient() || liffInstance.isLoggedIn())) {
          const profile = await getLiffProfile();
          if (profile) {
            const existingUser = stored;
            const liffUser: UserProfile = {
              id: profile.userId,
              nickname: existingUser?.nickname || profile.displayName,
              ageGroup: existingUser?.ageGroup || "27-28",
              area: existingUser?.area || "",
              job: existingUser?.job || "",
              bio: existingUser?.bio || "",
              avatarEmoji: existingUser?.avatarEmoji || getRandomEmoji(),
              isLoggedIn: true,
            };
            setUserState(liffUser);
            saveUser(liffUser);

            // Login to backend
            try {
              const accessToken = liffInstance.getAccessToken();
              if (accessToken) {
                const res = await fetch("/api/auth/login", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ accessToken }),
                });
                if (res.ok) {
                  const data = await res.json();
                  setDbUserState(data.user);
                }
              }
            } catch (e) {
              console.error("Backend login failed:", e);
            }
          }
        }
      }
      setIsReady(true);
    });
  }, []);

  const setUser = useCallback((u: UserProfile | null) => {
    setUserState(u);
    saveUser(u);
  }, []);

  const setDbUser = useCallback((u: DbUser | null) => {
    setDbUserState(u);
  }, []);

  const login = useCallback(() => {
    if (isLiffMode) {
      liffLogin();
    } else {
      const mockUser: UserProfile = {
        id: "demo_user_1",
        nickname: "",
        ageGroup: "27-28",
        area: "",
        job: "",
        bio: "",
        avatarEmoji: getRandomEmoji(),
        isLoggedIn: true,
      };
      setUser(mockUser);
    }
  }, [isLiffMode, setUser]);

  const logout = useCallback(() => {
    setUser(null);
    setDbUserState(null);
    localStorage.removeItem("triangle_match");
    localStorage.removeItem("triangle_chat");
    localStorage.removeItem("triangle_review_done");
    const liffInstance = getLiff();
    if (isLiffMode && liffInstance?.isLoggedIn()) {
      liffInstance.logout();
    }
  }, [isLiffMode, setUser]);

  const value = useMemo(
    () => ({ isReady, isLiffMode, user, dbUser, setUser, setDbUser, login, logout }),
    [isReady, isLiffMode, user, dbUser, setUser, setDbUser, login, logout]
  );

  return (
    <LiffContext.Provider value={value}>
      {children}
    </LiffContext.Provider>
  );
}
