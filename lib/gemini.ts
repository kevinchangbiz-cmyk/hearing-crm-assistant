import { GoogleGenerativeAI } from "@google/generative-ai";
import { CRM_SYSTEM_PROMPT, buildUserMessage, parseCrmOutput } from "./prompt";
import type { CrmResult } from "./types";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

/** 遇到模型過載（503）或流量限制（429）時，最多重試的次數 */
const MAX_RETRIES = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isRetryable(err: any): boolean {
  const msg = String(err?.message ?? err ?? "");
  return (
    msg.includes("503") ||
    msg.includes("Service Unavailable") ||
    msg.includes("overloaded") ||
    msg.includes("high demand") ||
    msg.includes("429") ||
    msg.includes("rate limit")
  );
}

/**
 * 將驗配師輸入送至 Gemini，回傳整理後的 CRM 與提醒。
 * 遇到模型暫時過載會自動重試（指數退避）。
 */
export async function generateCrm(params: {
  customerName?: string;
  rawText: string;
}): Promise<CrmResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("缺少 GEMINI_API_KEY 環境變數");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction: CRM_SYSTEM_PROMPT,
    generationConfig: {
      temperature: 0.2,
    },
  });

  const userMessage = buildUserMessage(params);
  let lastErr: any;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await model.generateContent(userMessage);
      return parseCrmOutput(result.response.text());
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES && isRetryable(err)) {
        await sleep(800 * (attempt + 1)); // 0.8s, 1.6s, 2.4s
        continue;
      }
      break;
    }
  }

  if (isRetryable(lastErr)) {
    throw new Error("AI 服務目前忙碌中，請稍候幾秒再按一次「產生 CRM」。");
  }
  throw lastErr;
}
