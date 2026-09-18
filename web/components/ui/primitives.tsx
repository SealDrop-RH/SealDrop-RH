import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  Ref,
} from "react";
import {cn} from "@/lib/cn";

/**
 * The shared shell. Every value here comes from a token, so a skin retints the whole app
 * without any component being edited.
 *
 * Nothing here has a corner radius, and that is deliberate rather than unfinished. The
 * product argues that it is an instrument, and an instrument has edges. See the note in
 * components/ui/instrument.tsx. The --radius-* tokens still exist for the two things that
 * are genuinely not part of the instrument: the focus ring, and the wallet modal we do not
 * own. Adding `rounded-md` back to a button here would quietly reintroduce the shape the
 * whole system was squared to get rid of.
 *
 * Two motion rules are load-bearing and easy to lose in a refactor:
 *   - transitions name their properties. `transition-all` animates layout properties the
 *     moment someone adds one, and then the button repaints on every hover.
 *   - anything pressable scales to 0.97 on :active. It is the cheapest way to make the
 *     interface feel like it heard you, and its absence is felt without being noticed.
 */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const BUTTON_BASE = cn(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium",
  "transition-[transform,background-color,color,box-shadow,opacity] duration-[var(--dur-micro)] ease-out",
  "active:scale-[0.97]",
  "disabled:pointer-events-none disabled:opacity-45",
);

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg hover:brightness-110",
  secondary: "bg-surface-2 text-fg shadow-[inset_0_0_0_1px_var(--border)] hover:bg-surface-3",
  ghost: "bg-transparent text-fg-muted hover:bg-surface-2 hover:text-fg",
  danger: "bg-negative-dim text-negative shadow-[inset_0_0_0_1px_var(--negative-dim)] hover:bg-negative hover:text-bg",
};

/** 44px minimum on the two larger sizes: a touch target you can actually hit. */
const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-11 px-4 text-sm",
  lg: "h-12 px-6 text-[15px]",
};

export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md", className?: string) {
  return cn(BUTTON_BASE, BUTTON_VARIANT[variant], BUTTON_SIZE[size], className);
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {variant?: ButtonVariant; size?: ButtonSize}) {
  return <button type={props.type ?? "button"} className={buttonClass(variant, size, className)} {...props} />;
}

/**
 * A link that looks like a button. Separate from Button on purpose: a thing that navigates
 * is an anchor, and it needs to keep middle-click, copy-link and the keyboard behaviour an
 * anchor already has. Wrapping a Link in a <button> would throw all of that away and nest
 * interactive elements while it was at it.
 */
export function ButtonLink({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {variant?: ButtonVariant; size?: ButtonSize}) {
  return <a className={buttonClass(variant, size, className)} {...props} />;
}

export function Card({className, children}: {className?: string; children: ReactNode}) {
  return (
    <div className={cn("bg-surface shadow-[var(--shadow-1)]", className)}>{children}</div>
  );
}

export function Label({className, ...props}: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("block text-[12.5px] font-medium tracking-wide text-fg-muted", className)}
      {...props}
    />
  );
}

export function Input({className, ...props}: InputHTMLAttributes<HTMLInputElement> & {ref?: Ref<HTMLInputElement>}) {
  return (
    <input
      className={cn(
        "h-11 w-full bg-surface-2 px-3 text-sm text-fg",
        "shadow-[inset_0_0_0_1px_var(--border)] placeholder:text-fg-subtle",
        "transition-[box-shadow,background-color] duration-[var(--dur-micro)] ease-out",
        "hover:shadow-[inset_0_0_0_1px_var(--border-strong)]",
        "focus:shadow-[inset_0_0_0_1px_var(--accent)] focus:outline-none",
        "disabled:opacity-45",
        className,
      )}
      {...props}
    />
  );
}

/** Helper and error text. Always rendered under the field it describes, never as a tooltip. */
export function Hint({tone = "muted", children}: {tone?: "muted" | "error" | "positive"; children: ReactNode}) {
  const toneClass =
    tone === "error" ? "text-negative" : tone === "positive" ? "text-positive" : "text-fg-subtle";
  return <p className={cn("text-[12.5px] leading-relaxed", toneClass)}>{children}</p>;
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "accent" | "positive" | "warn" | "negative";
  children: ReactNode;
}) {
  const toneClass = {
    neutral: "bg-surface-2 text-fg-muted",
    accent: "bg-accent-dim text-accent",
    positive: "bg-positive-dim text-positive",
    warn: "bg-warn-dim text-warn",
    negative: "bg-negative-dim text-negative",
  }[tone];
  return (
    <span
      className={cn(
        // Caption grade, like every other label. A badge set in the body face reads as a
        // sticker applied to the interface rather than as a field of it.
        "inline-flex items-center px-1.5 py-0.5",
        "font-mono text-[9.5px] uppercase leading-none tracking-[0.12em]",
        toneClass,
      )}
    >
      {children}
    </span>
  );
}

/**
 * An empty state says what would be here and how to put something here. A shrug and a
 * grey box is a dead end, and every list in this app can legitimately be empty.
 */
export function Empty({title, body, action}: {title: string; body?: string; action?: ReactNode}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center shadow-[inset_0_0_0_1px_var(--border)]">
      <p className="text-sm font-medium text-fg">{title}</p>
      {body ? <p className="max-w-[46ch] text-[13px] leading-relaxed text-fg-muted">{body}</p> : null}
      {action}
    </div>
  );
}

/** Matches the shape of what is loading, so the layout does not jump when it arrives. */
export function Skeleton({className}: {className?: string}) {
  return <div className={cn("animate-pulse bg-surface-2", className)} />;
}

/** Every number, address and hash in the app. Tabular figures so digits line up. */
export function Mono({className, children}: {className?: string; children: ReactNode}) {
  return <span className={cn("num", className)}>{children}</span>;
}
