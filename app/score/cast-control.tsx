"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import styles from "./score.module.css";

type PresentationAvailabilityLike = {
  value: boolean;
  addEventListener(type: "change", listener: () => void): void;
  removeEventListener(type: "change", listener: () => void): void;
};

type PresentationConnectionLike = {
  state: string;
  terminate(): Promise<void>;
  addEventListener(type: "close" | "terminate", listener: () => void): void;
};

type PresentationRequestLike = {
  start(): Promise<PresentationConnectionLike>;
  getAvailability(): Promise<PresentationAvailabilityLike>;
};

type PresentationRequestConstructor = new (urls: string[]) => PresentationRequestLike;
type CastStatus = "checking" | "available" | "unavailable" | "connecting" | "connected";

function presentationConstructor() {
  return (window as unknown as { PresentationRequest?: PresentationRequestConstructor }).PresentationRequest;
}

export default function CastControl() {
  const [status, setStatus] = useState<CastStatus>("checking");
  const requestRef = useRef<PresentationRequestLike | null>(null);
  const connectionRef = useRef<PresentationConnectionLike | null>(null);

  useEffect(() => {
    const Request = presentationConstructor();
    if (!Request) {
      setStatus("unavailable");
      return;
    }

    const request = new Request([`${window.location.origin}/display?presentation=1`]);
    requestRef.current = request;
    const presentation = navigator as Navigator & { presentation?: { defaultRequest?: PresentationRequestLike } };
    if (presentation.presentation) presentation.presentation.defaultRequest = request;

    let availability: PresentationAvailabilityLike | null = null;
    const updateAvailability = () => setStatus((current) => current === "connected" || current === "connecting" ? current : availability?.value ? "available" : "unavailable");

    void request.getAvailability()
      .then((nextAvailability) => {
        availability = nextAvailability;
        updateAvailability();
        availability.addEventListener("change", updateAvailability);
      })
      .catch(() => setStatus("available"));

    return () => availability?.removeEventListener("change", updateAvailability);
  }, []);

  const searchDevices = async () => {
    if (status === "connected" && connectionRef.current) {
      try { await connectionRef.current.terminate(); } catch { /* 设备可能已经主动断开 */ }
      connectionRef.current = null;
      setStatus("available");
      return;
    }

    const request = requestRef.current;
    if (!request) {
      window.alert("当前浏览器不支持网页设备搜索。Android 建议使用最新版 Chrome；也可以在电视浏览器中直接打开“电视看板”。");
      return;
    }

    setStatus("connecting");
    try {
      const connection = await request.start();
      connectionRef.current = connection;
      setStatus("connected");
      const reset = () => {
        connectionRef.current = null;
        setStatus("available");
      };
      connection.addEventListener("close", reset);
      connection.addEventListener("terminate", reset);
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      setStatus("available");
      if (name === "AbortError") return;
      if (name === "NotFoundError") {
        window.alert("没有发现兼容的投屏设备。请确认手机和电视连接同一个 Wi-Fi，并关闭路由器的客户端隔离。");
        return;
      }
      window.alert("暂时无法开始投屏。请确认浏览器允许查找附近设备，并让电视保持在可投屏状态。");
    }
  };

  const label = status === "connecting" ? "正在搜索…" : status === "connected" ? "停止投屏" : "搜索投屏设备";

  return <div className={styles.castActions}>
    <Link className={styles.displayLink} href="/display" target="_blank">电视看板</Link>
    <button className={`${styles.castButton} ${status === "connected" ? styles.castButtonConnected : ""}`} type="button" onClick={searchDevices} disabled={status === "connecting"} aria-label={label} title={status === "unavailable" ? "当前浏览器可能不支持自动搜索，可直接打开电视看板" : label}>
      <span className={styles.castIcon} aria-hidden="true"><i /></span>
      <b>{label}</b>
    </button>
  </div>;
}
