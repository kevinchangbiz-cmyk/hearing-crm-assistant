import fs from "node:fs";
import path from "node:path";
import type { Store, StoresConfig } from "./types";

let cached: StoresConfig | null = null;

/**
 * 載入店別/權限設定。
 * 優先順序：
 *   1. 環境變數 STORES_CONFIG（Vercel 部署用，整份 JSON 壓成一行）
 *   2. 專案根目錄 config/stores.json（本機開發用）
 */
export function loadStoresConfig(): StoresConfig {
  if (cached) return cached;

  const fromEnv = process.env.STORES_CONFIG;
  if (fromEnv && fromEnv.trim().length > 0) {
    cached = normalize(JSON.parse(fromEnv));
    return cached;
  }

  const filePath = path.join(process.cwd(), "config", "stores.json");
  if (fs.existsSync(filePath)) {
    const raw = fs.readFileSync(filePath, "utf-8");
    cached = normalize(JSON.parse(raw));
    return cached;
  }

  cached = { stores: [], permissions: [] };
  return cached;
}

function normalize(cfg: Partial<StoresConfig>): StoresConfig {
  return {
    stores: cfg.stores ?? [],
    permissions: cfg.permissions ?? [],
  };
}

/** 取得某使用者被授權的店別清單 */
export function getStoresForUser(email: string | null | undefined): Store[] {
  if (!email) return [];
  const cfg = loadStoresConfig();
  const perm = cfg.permissions.find(
    (p) => p.email.toLowerCase() === email.toLowerCase(),
  );
  if (!perm) return [];
  return cfg.stores.filter((s) => perm.storeIds.includes(s.id));
}

/** 取得單一店別，並驗證該使用者是否有權限 */
export function getAuthorizedStore(
  email: string | null | undefined,
  storeId: string,
): Store | null {
  const stores = getStoresForUser(email);
  return stores.find((s) => s.id === storeId) ?? null;
}
