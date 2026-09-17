"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type ConfirmOptions = {
  title: string;
  body?: string;
  confirmLabel: string;
  tone?: "danger" | "primary";
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(() => Promise.resolve(false));

// Pengganti window.confirm: `if (!(await confirm({...}))) return;`
export const useConfirm = () => useContext(ConfirmContext);

// <dialog> native: fokus terkunci di dalam modal & Esc menutup, tanpa library.
// showModal() memfokuskan tombol pertama (Batal) — default aman untuk aksi berbahaya.
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);

  const confirm = useCallback<ConfirmFn>((o) => {
    resolver.current?.(false); // dialog lama yang belum dijawab dianggap batal
    setOptions(o);
    return new Promise((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  useEffect(() => {
    if (options && !ref.current?.open) ref.current?.showModal();
  }, [options]);

  function close(ok: boolean) {
    resolver.current?.(ok);
    resolver.current = null;
    ref.current?.close();
    setOptions(null);
  }

  const danger = options?.tone === "danger";

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <dialog
        ref={ref}
        aria-labelledby="confirm-title"
        onCancel={(e) => {
          e.preventDefault();
          close(false);
        }}
        // Klik di luar kotak (backdrop) = batal
        onClick={(e) => e.target === ref.current && close(false)}
        className="fixed inset-0 m-auto h-fit w-[min(28rem,calc(100%-2rem))] rounded-lg border border-border bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/40"
      >
        {options && (
          <div className="p-5">
            <h2 id="confirm-title" className="font-display text-lg font-semibold [text-wrap:balance]">
              {options.title}
            </h2>
            {options.body && <p className="mt-2 whitespace-pre-line text-sm text-ink-muted">{options.body}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => close(false)}
                className="rounded-md border border-border px-4 py-2 text-sm font-semibold hover:bg-surface-sunken"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => close(true)}
                className={`rounded-md px-4 py-2 text-sm font-semibold text-white ${
                  danger ? "bg-danger hover:brightness-110" : "bg-primary hover:bg-primary-hover"
                }`}
              >
                {options.confirmLabel}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </ConfirmContext.Provider>
  );
}
