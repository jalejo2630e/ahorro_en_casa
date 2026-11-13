"use client";

import { useEffect, useState } from "react";
import { subscribePushAction, testPushAction, unsubscribePushAction } from "@/app/push-actions";

type Phase = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

function keyToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const btn = "rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60";

/** Activa, prueba y desactiva los avisos de pagos en ESTE dispositivo. */
export function PushSettings({ publicKey }: { publicKey: string | null }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      if (!supported) {
        const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
        if (alive) setPhase(ios ? "ios-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return void (alive && setPhase("denied"));
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
        const sub = await reg.pushManager.getSubscription();
        if (!alive) return;
        setEndpoint(sub?.endpoint ?? null);
        setPhase(sub ? "on" : "off");
      } catch {
        if (alive) setPhase("unsupported");
      }
    })();
    return () => { alive = false; };
  }, []);

  if (!publicKey) {
    return <p className="text-sm text-slate-500">Los avisos no están configurados en el servidor.</p>;
  }

  async function enable() {
    setBusy(true);
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setPhase(perm === "denied" ? "denied" : "off");
        setMsg({ ok: false, text: "No diste permiso para mostrar avisos." });
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey!) });
      const r = await subscribePushAction(JSON.parse(JSON.stringify(sub)));
      if (!r.ok) {
        await sub.unsubscribe().catch(() => {});
        setMsg({ ok: false, text: r.message });
        return;
      }
      setEndpoint(sub.endpoint);
      setPhase("on");
      setMsg({ ok: true, text: r.message });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "No se pudieron activar los avisos" });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await unsubscribePushAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setEndpoint(null);
      setPhase("off");
      setMsg({ ok: true, text: "Avisos desactivados en este celular" });
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    if (!endpoint) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await testPushAction(endpoint);
      setMsg({ ok: r.ok, text: r.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {phase === "loading" && <p className="text-sm text-slate-500">Revisando este dispositivo…</p>}
      {phase === "unsupported" && (
        <p className="text-sm text-slate-500">Este navegador no permite avisos. En Android usa Chrome; en computador, Chrome, Edge o Firefox.</p>
      )}
      {phase === "ios-install" && (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          En iPhone los avisos solo funcionan con la app instalada: en Safari toca <strong>Compartir</strong> →{" "}
          <strong>Agregar a inicio</strong>, ábrela desde el ícono y vuelve aquí.
        </p>
      )}
      {phase === "denied" && (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          Bloqueaste los avisos para esta app. Actívalos en los permisos del navegador o del teléfono y recarga.
        </p>
      )}
      {phase === "off" && (
        <button type="button" onClick={enable} disabled={busy} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>
          {busy ? "Activando…" : "Activar avisos en este celular"}
        </button>
      )}
      {phase === "on" && (
        <>
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">✓ Los avisos están activados en este dispositivo.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={test} disabled={busy} className={`${btn} border border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800`}>
              Enviar aviso de prueba
            </button>
            <button type="button" onClick={disable} disabled={busy} className={`${btn} text-slate-500 underline`}>
              Desactivar
            </button>
          </div>
        </>
      )}
      {msg && (
        <p role="status" className={`text-sm font-medium ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>{msg.text}</p>
      )}
    </div>
  );
}
