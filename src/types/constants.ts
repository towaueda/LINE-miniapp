import type { AreaOption } from "./index";

export const AREA_LABELS: Record<AreaOption, string> = {
  umeda: "梅田",
  honmachi: "本町",
  namba: "難波/心斎橋",
};

export const INDUSTRY_OPTIONS = [
  { value: "it", label: "IT" },
  { value: "finance", label: "金融" },
  { value: "manufacturer", label: "メーカー" },
  { value: "trading", label: "商社" },
  { value: "service", label: "サービス" },
  { value: "consulting", label: "コンサル" },
  { value: "media", label: "広告・メディア" },
  { value: "realestate", label: "不動産" },
  { value: "medical", label: "医療" },
  { value: "other", label: "その他" },
];

export const INDUSTRY_LABEL_MAP = new Map(INDUSTRY_OPTIONS.map((o) => [o.value, o.label]));

export const AGE_OPTIONS: number[] = [];
for (let a = 24; a <= 30; a++) {
  AGE_OPTIONS.push(a);
}

export const CHAT_DEADLINE_SUFFIX = "T23:59:59+09:00";
