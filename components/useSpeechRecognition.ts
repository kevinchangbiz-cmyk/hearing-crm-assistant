"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
};

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  return (
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition ||
    null
  );
}

/**
 * 瀏覽器即時語音轉文字（Web Speech API）。
 * 不上傳音檔，直接在瀏覽器端轉錄，邊講邊出字。
 */
export function useSpeechRecognition() {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // 透過 callback 把最終結果回拋給呼叫端，避免狀態競爭
  const onFinalRef = useRef<((text: string) => void) | null>(null);
  // 使用者「想不想」持續聆聽（true 時即使引擎自己結束也要自動接回）
  const shouldListenRef = useRef(false);
  const restartTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setSupported(getRecognitionCtor() !== null);
  }, []);

  const clearRestartTimer = () => {
    if (restartTimerRef.current !== null) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  };

  const stop = useCallback(() => {
    shouldListenRef.current = false;
    clearRestartTimer();
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    setListening(false);
    setInterim("");
  }, []);

  const start = useCallback((onFinal: (text: string) => void) => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setError("此瀏覽器不支援語音輸入，請改用 Chrome，或直接打字。");
      return;
    }

    setError(null);
    setInterim("");
    onFinalRef.current = onFinal;
    shouldListenRef.current = true;

    // 每次（重）啟動都建立全新的辨識物件，避免重用同一物件導致啟動失敗
    const launch = () => {
      if (!shouldListenRef.current) return;
      clearRestartTimer();

      const recognition = new Ctor();
      recognition.lang = "zh-TW";
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (event: any) => {
        let interimText = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = result[0].transcript;
          if (result.isFinal) {
            onFinalRef.current?.(transcript);
          } else {
            interimText += transcript;
          }
        }
        setInterim(interimText);
      };

      recognition.onerror = (event: any) => {
        const err = event?.error;
        // 權限類錯誤是致命的：停止並提示
        if (err === "not-allowed" || err === "service-not-allowed") {
          shouldListenRef.current = false;
          setError("麥克風權限被拒，請允許麥克風後再試。");
          setListening(false);
          return;
        }
        // 其它（no-speech / aborted / network / audio-capture）為暫時性，
        // 交給 onend 自動重啟，不打擾使用者。
      };

      recognition.onend = () => {
        setInterim("");
        if (shouldListenRef.current) {
          // 引擎自己結束（靜音/逾時）時，稍後用新物件接回去
          restartTimerRef.current = window.setTimeout(launch, 250);
        } else {
          setListening(false);
        }
      };

      recognitionRef.current = recognition;
      try {
        recognition.start();
        setListening(true);
      } catch {
        // 引擎可能尚未釋放，稍後重試一次
        restartTimerRef.current = window.setTimeout(launch, 350);
      }
    };

    launch();
  }, []);

  useEffect(() => {
    return () => {
      shouldListenRef.current = false;
      clearRestartTimer();
      try {
        recognitionRef.current?.abort();
      } catch {
        /* ignore */
      }
    };
  }, []);

  return { supported, listening, interim, error, start, stop };
}
