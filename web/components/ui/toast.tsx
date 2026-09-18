"use client";

import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from "react";
import {ArrowSquareOut, CheckCircle, Info, WarningCircle} from "@phosphor-icons/react";
import {cn} from "@/lib/cn";

/**
 * Toasts, in the shape StockBound settled on.
 *
 * Two details are worth keeping through any refactor. Timers pause on hover, because a
 * toast you are reading should not leave while you read it. And a dismissed toast animates
 * out before it unmounts, rather than vanishing, because a transaction result disappearing
 * instantly reads as something having gone wrong.
 */

export type ToastKind = "info" | "success" | "error";

export interface ToastInput {
  kind: ToastKind;
  title: string;
  body?: string;
  /** Usually a block explorer link for the transaction this toast is about. */
  link?: string;
  linkLabel?: string;
}

interface Toast extends ToastInput {
  id: number;
  /** Set while the exit transition plays, so the element is still mounted to animate. */
  leaving?: boolean;
}

/** An error stays until dismissed: it is the only kind carrying something to act on. */
const LIFETIME: Record<ToastKind, number> = {info: 5000, success: 6000, error: Infinity};
const EXIT_MS = 180;

/**
 * Errors never expire on their own, so without a cap a run of failures stacks until the
 * column runs off the screen and covers the page behind it. The oldest is dropped instead:
 * the newest failure is the one being acted on.
 */
const MAX_VISIBLE = 3;

const ToastContext = createContext<{push: (toast: ToastInput) => void} | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>");
  return context;
}

export function ToastProvider({children}: {children: React.ReactNode}) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.map((t) => (t.id === id ? {...t, leaving: true} : t)));
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), EXIT_MS);
  }, []);

  const schedule = useCallback(
    (id: number, ms: number) => {
      if (!Number.isFinite(ms)) return;
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), ms),
      );
    },
    [dismiss],
  );

  const push = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      setToasts((list) => [...list, {...input, id}].slice(-MAX_VISIBLE));
      schedule(id, LIFETIME[input.kind]);
    },
    [schedule],
  );

  // Every pending timer is cleared on unmount. Without this a navigation mid-toast leaves a
  // timeout holding a setState for a tree that no longer exists.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const value = useMemo(() => ({push}), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-relevant="additions"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col items-center gap-2 p-4 sm:items-end"
      >
        {toasts.map((toast) => (
          <ToastRow
            key={toast.id}
            toast={toast}
            onDismiss={() => dismiss(toast.id)}
            onHoverChange={(hovering) => {
              const timer = timers.current.get(toast.id);
              if (hovering) {
                if (timer) clearTimeout(timer);
                timers.current.delete(toast.id);
              } else if (!timers.current.has(toast.id) && !toast.leaving) {
                schedule(toast.id, LIFETIME[toast.kind]);
              }
            }}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const ICON: Record<ToastKind, typeof Info> = {
  info: Info,
  success: CheckCircle,
  error: WarningCircle,
};

const TONE: Record<ToastKind, string> = {
  info: "text-info",
  success: "text-positive",
  error: "text-negative",
};

function ToastRow({
  toast,
  onDismiss,
  onHoverChange,
}: {
  toast: Toast;
  onDismiss: () => void;
  onHoverChange: (hovering: boolean) => void;
}) {
  const Icon = ICON[toast.kind];
  return (
    <div
      onPointerEnter={() => onHoverChange(true)}
      onPointerLeave={() => onHoverChange(false)}
      className={cn(
        "pointer-events-auto flex w-full max-w-sm gap-3 bg-surface p-3 shadow-[var(--shadow-2)]",
        "transition-[opacity,transform] duration-[var(--dur-enter)] ease-out",
        // Never scale(0): nothing in the real world appears from nothing.
        toast.leaving ? "translate-y-1 scale-[0.98] opacity-0" : "translate-y-0 scale-100 opacity-100",
      )}
      // @starting-style would be tidier, but a value set on mount is what makes the enter
      // transition run without a second render pass.
      style={{transitionDuration: toast.leaving ? `${EXIT_MS}ms` : undefined}}
    >
      <Icon size={17} weight="fill" className={cn("mt-0.5 shrink-0", TONE[toast.kind])} aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-[13.5px] font-medium text-fg">{toast.title}</p>
        {toast.body ? <p className="text-[12.5px] leading-relaxed text-fg-muted">{toast.body}</p> : null}
        {toast.link ? (
          <a
            href={toast.link}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-fit items-center gap-1 text-[12.5px] text-accent hover:underline"
          >
            {toast.linkLabel ?? "View transaction"}
            <ArrowSquareOut size={12} aria-hidden />
          </a>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="h-6 shrink-0 px-1.5 text-[12px] text-fg-subtle transition-colors duration-[var(--dur-micro)] ease-out hover:text-fg"
      >
        close
      </button>
    </div>
  );
}
