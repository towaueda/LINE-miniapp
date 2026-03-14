"use client";

import { createContext, useContext, useEffect, useState, useCallback, useMemo, ReactNode } from "react";
import type { UserProfile, DbUser } from "@/types";
import { initLiff, getLiffProfile, liffLogin, getLiff } from "@/lib/liff";
import { getRandomEmoji } from "@/lib/emoji";

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
  const stored = sessionStorage.getItem(STORAGE_KEY);
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
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } else {
    sessionStorage.removeItem(STORAGE_KEY);
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
              birthYear: existingUser?.birthYear || 2000,
              area: existingUser?.area || "",
              industry: existingUser?.industry || "",
              company: existingUser?.company || "",
              bio: existingUser?.bio || "",
              avatarEmoji: existingUser?.avatarEmoji || getRandomEmoji(),
              isLoggedIn: true,
            };
            setUserState(liffUser);
            saveUser(liffUser);

            // Login to backend with invite code if present (retry up to 3 times)
            const accessToken = liffInstance.getAccessToken();
            if (accessToken) {
              const inviteCode = sessionStorage.getItem("triangle_invite_code");
              const MAX_RETRIES = 3;
              for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
                try {
                  const res = await fetch("/api/auth/login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ accessToken, inviteCode: inviteCode || undefined }),
                  });
                  if (res.ok) {
                    const data = await res.json();
                    setDbUserState(data.user);
                    sessionStorage.removeItem("triangle_invite_code");
                    break;
                  }
                  // 4xx はリトライしても無駄なので打ち切り
                  if (res.status >= 400 && res.status < 500) break;
                } catch (e) {
                  console.error(`Backend login attempt ${attempt + 1} failed:`, e);
                }
                // 次のリトライまで待機（指数バックオフ: 1s, 2s）
                if (attempt < MAX_RETRIES - 1) {
                  await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
                }
              }
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
    }
  }, [isLiffMode]);

  const logout = useCallback(() => {
    setUser(null);
    setDbUserState(null);
    sessionStorage.removeItem("triangle_match");
    sessionStorage.removeItem("triangle_chat");
    sessionStorage.removeItem("triangle_review_done");
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
