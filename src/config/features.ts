// src/config/features.ts
/**
 * 读取开关：默认 true，设置成 "false" 才关闭
 * 支持 Edge/Node 运行时（middleware 也可以用）
 */
export type FeatureFlags = {
  HOME: boolean;
  TRANSLATIONS: boolean;
  TEAMS: boolean;
  MARKETPLACE: boolean;
  BILLING: boolean;
  SETTINGS: boolean;
};

function boolFromEnv(v: string | undefined, def = true) {
  if (v === undefined) return def;
  const s = String(v).trim().toLowerCase();
  return !(s === "0" || s === "false" || s === "off" || s === "no");
}

export function readFeatureFlags(): FeatureFlags {
  return {
    HOME:        boolFromEnv(process.env.FEATURE_DASHBOARD_HOME,        true),
    TRANSLATIONS: boolFromEnv(process.env.FEATURE_DASHBOARD_TRANSLATIONS, true),
    TEAMS:       boolFromEnv(process.env.FEATURE_DASHBOARD_TEAMS,       true),
    MARKETPLACE: boolFromEnv(process.env.FEATURE_DASHBOARD_MARKETPLACE, true),
    BILLING:     boolFromEnv(process.env.FEATURE_DASHBOARD_BILLING,     true),
    SETTINGS:    boolFromEnv(process.env.FEATURE_DASHBOARD_SETTINGS,    true),
  };
}

/** 供 middleware 等直接引用的“即时值”。 */
export const FEATURES: FeatureFlags = readFeatureFlags();
