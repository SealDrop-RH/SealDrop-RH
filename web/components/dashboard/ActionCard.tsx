import Link from "next/link";
import {ArrowRight} from "@phosphor-icons/react/dist/ssr";
import {cn} from "@/lib/cn";
import {MICRO} from "@/components/ui/instrument";

/**
 * One thing you can do, as a row you click anywhere on.
 *
 * The arrow is decorative: the whole row is the link, so there is one tab stop and one hit
 * target rather than a row containing a smaller link you have to aim at.
 *
 * Square and hairline-bounded, and the label is set at caption grade like every other label
 * in the app. The only thing that distinguishes the primary action is the accent on its
 * call to action, which is the same rule the register's own two actions follow: shape
 * carries no meaning here, colour does.
 */
export function ActionCard({
  title,
  body,
  cta,
  href,
  primary,
}: {
  title: string;
  body: string;
  cta: string;
  href: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex min-w-0 flex-col gap-2 border border-border p-3 sm:p-4",
        "transition-[background-color,box-shadow] duration-[var(--dur-micro)] ease-out",
        "hover:bg-surface-2 hover:shadow-[inset_0_0_0_1px_var(--border-strong)]",
      )}
    >
      <h3 className={cn(MICRO, "text-fg")}>{title}</h3>
      <p className="max-w-[52ch] text-[12.5px] leading-relaxed text-fg-muted">{body}</p>
      <span
        className={cn(
          MICRO,
          "mt-auto inline-flex items-center gap-1.5 pt-2",
          primary ? "text-accent" : "text-fg-subtle group-hover:text-fg",
        )}
      >
        {cta}
        <ArrowRight
          size={10}
          weight="bold"
          aria-hidden
          className="transition-transform duration-[var(--dur-micro)] ease-out group-hover:translate-x-0.5"
        />
      </span>
    </Link>
  );
}
