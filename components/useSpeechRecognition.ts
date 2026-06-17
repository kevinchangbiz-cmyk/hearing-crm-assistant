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
  const manualStopRef = useRef(false);

  useEffect(() => {
    setSupported(getRecognitionCtor() !== null);
  }, []);

  const stop = useCallback(() => {
    manualStopRef.current = true;
    recognitionRef.current?.stop();
    setListening(false);
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
    manualStopRef.current = false;

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
      if (event?.error === "no-speech" || event?.error === "aborted") return;
      if (event?.error === "not-allowed") {
        setError("麥克風權限被拒，請允許麥克風後再試。");
      } else {
        setError(`語音辨識發生錯誤：${event?.error ?? "未知"}`);
      }
    };

    recognition.onend = () => {
      setInterim("");
      // continuous 模式下若非手動停止，自動續錄（手機常會自動中斷）
      if (!manualStopRef.current) {
        try {
          recognition.start();
          return;
        } catch {
          /* ignore */
        }
      }
      setListening(false);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      setError("無法啟動語音辨識，請重試。");
    }
  }, []);

  useEffect(() => {
    return () => {
      manualStopRef.current = true;
      recognitionRef.current?.abort();
    };
  }, []);

  return { supported, listening, interim, error, start, stop };
}
