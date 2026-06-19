"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { useSpeechRecognition } from "./useSpeechRecognition";
import {
  buildReminderTitle,
  suggestReminderDate,
  suggestReminderTime,
  buildDayLogTitle,
} from "@/lib/reminder";

type StoreOption = { id: string; name: string };

// 型號快選：英文型號用「點」的，避免語音聽錯（清單可隨時增修）
const MODEL_GROUPS: { label: string; items: string[] }[] = [
  { label: "品牌", items: ["Rexton", "Coselgi", "Widex"] },
  {
    label: "型號",
    items: ["M-Core", "BiCore", "Reach", "reCharge", "M3", "M5", "M7"],
  },
  { label: "等級", items: ["40", "60", "80", "220", "330", "440", "10", "30"] },
];

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function nowTimeString(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

/** "2026-06-19" -> "6/19" */
function formatMonthDay(dateStr: string): string {
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  return `${Number(parts[1])}/${Number(parts[2])}`;
}

export default function CrmApp() {
  const { data: session } = useSession();

  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storeId, setStoreId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [rawText, setRawText] = useState("");

  const [crm, setCrm] = useState("");
  const [reminderText, setReminderText] = useState<string | null>(null);

  // 服務日期/時間（預設今天、現在，可手動改；補登時改成實際服務時間）
  const [serviceDate, setServiceDate] = useState(todayString());
  const [serviceTime, setServiceTime] = useState(nowTimeString());

  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedToSheet, setSavedToSheet] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 提醒確認卡片
  const [reminderDate, setReminderDate] = useState("");
  const [reminderTime, setReminderTime] = useState("10:00");
  const [reminderTitle, setReminderTitle] = useState("");
  const [reminderDone, setReminderDone] = useState(false);
  const [creatingEvent, setCreatingEvent] = useState(false);

  const speech = useSpeechRecognition();
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/stores")
      .then((r) => r.json())
      .then((d) => {
        const list: StoreOption[] = d.stores ?? [];
        setStores(list);
        if (list.length > 0) setStoreId(list[0].id);
      })
      .catch(() => setError("無法載入店別清單"));
  }, []);

  const canGenerate = useMemo(
    () => storeId && rawText.trim().length > 0 && !generating,
    [storeId, rawText, generating],
  );

  function toggleRecord() {
    if (speech.listening) {
      speech.stop();
    } else {
      setError(null);
      speech.start((finalText) => {
        setRawText((prev) => (prev ? `${prev} ${finalText}` : finalText).trim());
      });
    }
  }

  // 點選型號 → 插入到輸入文字（自動補空格）
  function insertModel(model: string) {
    setRawText((prev) => {
      const base = prev.trimEnd();
      return base ? `${base} ${model} ` : `${model} `;
    });
  }

  function resetResult() {
    setCrm("");
    setReminderText(null);
    setSavedToSheet(false);
    setReminderDone(false);
    setNotice(null);
  }

  // 清空，準備記下一筆（保留店別）
  function startNext() {
    if (speech.listening) speech.stop();
    setCustomerName("");
    setRawText("");
    resetResult();
    setError(null);
    setServiceDate(todayString());
    setServiceTime(nowTimeString());
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => nameRef.current?.focus(), 200);
  }

  async function handleGenerate() {
    if (!canGenerate) return;
    setGenerating(true);
    setError(null);
    resetResult();
    // 每產生一筆就把服務時間刷新為當下（補登時仍可手動改）
    setServiceDate(todayString());
    setServiceTime(nowTimeString());
    try {
      const res = await fetch("/api/crm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText, customerName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "整理失敗");

      setCrm(data.crm || "");
      if (data.reminder) {
        setReminderText(data.reminder);
        setReminderTitle(buildReminderTitle(customerName, data.crm || ""));
        setReminderDate(suggestReminderDate(data.reminder));
        setReminderTime(suggestReminderTime(data.reminder));
      }
    } catch (err: any) {
      setError(err.message || "CRM 整理失敗");
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(crm);
      setNotice("已複製 CRM 內容");
      setTimeout(() => setNotice(null), 2000);
    } catch {
      setError("複製失敗，請手動選取");
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      // 1) 備份到 Google Sheet
      const res = await fetch("/api/sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, customerName, rawText, crmResult: crm }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "寫入失敗");
      setSavedToSheet(true);

      // 2) 在服務當天（指定時間）登記一筆日曆事件：姓名 + 主要類別
      let calendarOk = false;
      try {
        const calRes = await fetch("/api/calendar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storeId,
            summary: buildDayLogTitle(customerName, crm),
            date: serviceDate,
            time: serviceTime,
            // 日曆只放標題；完整 CRM 已存在 Google Sheet，不重複寫描述
          }),
        });
        calendarOk = calRes.ok;
        if (!calRes.ok) {
          const calData = await calRes.json();
          setError(`已備份至 Sheet，但登記日曆失敗：${calData.error || "未知錯誤"}`);
        }
      } catch {
        setError("已備份至 Sheet，但登記日曆失敗（網路錯誤）");
      }

      if (calendarOk) {
        setNotice("已備份至 Sheet，並登記到當天日曆");
        setTimeout(() => setNotice(null), 2500);
      }
    } catch (err: any) {
      setError(err.message || "寫入 Google Sheet 失敗");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateReminder() {
    if (!reminderDate || !reminderTitle.trim()) {
      setError("請填寫提醒標題與日期");
      return;
    }
    setCreatingEvent(true);
    setError(null);
    try {
      const res = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          summary: reminderTitle,
          date: reminderDate,
          time: reminderTime,
          // 說明記錄「預約登記日」＝服務當日，例如 6/19 預約登記
          description: `${formatMonthDay(serviceDate)} 預約登記`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "建立失敗");
      setReminderDone(true);
      setNotice("已建立 Calendar 提醒");
      setTimeout(() => setNotice(null), 2500);
    } catch (err: any) {
      setError(err.message || "建立 Calendar 事件失敗");
    } finally {
      setCreatingEvent(false);
    }
  }

  return (
    <div className="app">
      <div className="topbar">
        <h1>助聽器服務紀錄</h1>
        <span className="user">
          {session?.user?.email}
          <button className="linkbtn" onClick={() => signOut()}>
            登出
          </button>
        </span>
      </div>

      {error && <div className="banner banner-error">{error}</div>}
      {notice && <div className="banner banner-success">{notice}</div>}

      {/* 店別 + 姓名 + 語音 + 文字輸入（單卡精簡） */}
      <div className="card stack">
        <div className="row">
          <div>
            <label className="field-label" htmlFor="store">
              店別
            </label>
            {stores.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                無可用店別
              </p>
            ) : (
              <select
                id="store"
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="field-label" htmlFor="customer">
              客戶姓名
            </label>
            <input
              id="customer"
              ref={nameRef}
              type="text"
              value={customerName}
              placeholder="例如：王大明"
              onChange={(e) => setCustomerName(e.target.value)}
            />
          </div>
        </div>

        <div className="record-row">
          <button
            className={`record-btn ${speech.listening ? "recording" : ""}`}
            onClick={toggleRecord}
            type="button"
          >
            {speech.listening ? "停止錄音" : "開始錄音"}
          </button>
          <span className="hint">
            {speech.listening
              ? "聆聽中…再點一下「停止錄音」結束"
              : speech.supported
                ? "點一下開始錄音，或直接打字"
                : "不支援語音，請打字"}
          </span>
        </div>

        <textarea
          id="raw"
          value={rawText + (speech.interim ? ` ${speech.interim}` : "")}
          placeholder="語音或文字輸入服務內容…"
          onChange={(e) => setRawText(e.target.value)}
        />

        <details className="model-pick">
          <summary>型號快選（點一下插入）</summary>
          <div className="model-groups">
            {MODEL_GROUPS.map((g) => (
              <div className="model-group" key={g.label}>
                <span className="model-group-label">{g.label}</span>
                <div className="chips">
                  {g.items.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className="chip"
                      onClick={() => insertModel(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </details>

        <button
          className="btn btn-primary btn-block"
          onClick={handleGenerate}
          disabled={!canGenerate}
        >
          {generating ? "整理中…" : "產生 CRM"}
        </button>
      </div>

      {/* CRM 結果 */}
      {crm && (
        <div className="card stack">
          <p className="section-title" style={{ margin: 0 }}>
            CRM 結果（可直接編輯）
          </p>
          <textarea
            className="crm-edit"
            value={crm}
            onChange={(e) => setCrm(e.target.value)}
          />

          <div>
            <label className="field-label">服務日期／時間（補登可改）</label>
            <div className="row">
              <input
                type="date"
                value={serviceDate}
                onChange={(e) => setServiceDate(e.target.value)}
              />
              <input
                type="time"
                value={serviceTime}
                onChange={(e) => setServiceTime(e.target.value)}
              />
            </div>
          </div>

          <div className="row">
            <button className="btn btn-ghost" onClick={handleCopy}>
              一鍵複製
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving || savedToSheet}
            >
              {savedToSheet ? "已同步" : saving ? "同步中…" : "同步到日曆"}
            </button>
          </div>

          <button
            className={`btn btn-block ${savedToSheet ? "btn-primary" : "btn-ghost"}`}
            onClick={startNext}
          >
            {savedToSheet ? "＋ 下一筆" : "清除重來"}
          </button>
        </div>
      )}

      {/* 提醒確認（必先確認再建立） */}
      {reminderText && !reminderDone && (
        <div className="card">
          <div className="reminder-box stack">
            <h3>偵測到追蹤提醒</h3>
            <p className="muted" style={{ margin: 0 }}>
              「{reminderText}」— 確認後才會建立日曆事件。
            </p>

            <div>
              <label className="field-label" htmlFor="rtitle">
                提醒標題
              </label>
              <input
                id="rtitle"
                type="text"
                value={reminderTitle}
                onChange={(e) => setReminderTitle(e.target.value)}
              />
            </div>

            <div>
              <label className="field-label" htmlFor="rdate">
                提醒日期／時間
              </label>
              <div className="row">
                <input
                  id="rdate"
                  type="date"
                  value={reminderDate}
                  onChange={(e) => setReminderDate(e.target.value)}
                />
                <input
                  id="rtime"
                  type="time"
                  value={reminderTime}
                  onChange={(e) => setReminderTime(e.target.value)}
                />
              </div>
            </div>

            <div className="row">
              <button
                className="btn btn-ghost"
                onClick={() => setReminderDone(true)}
              >
                略過
              </button>
              <button
                className="btn btn-primary"
                onClick={handleCreateReminder}
                disabled={creatingEvent}
              >
                {creatingEvent ? "建立中…" : "將預約加入日曆"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
