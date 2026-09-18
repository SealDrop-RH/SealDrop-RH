import {notFound} from "next/navigation";
import {Badge, Button, Card, Empty, Hint, Input, Label, Mono, Skeleton} from "@/components/ui/primitives";

/**
 * Every token and every primitive on one page, so a skin can be judged in one scroll
 * instead of by hunting through the app. Not shipped: production returns a 404.
 */
export const metadata = {title: "Kitchen sink"};

const GROUNDS = ["bg", "bg-elev", "surface", "surface-2", "surface-3"];
const INK = ["fg", "fg-muted", "fg-subtle"];
const MEANING = ["accent", "positive", "warn", "negative", "info"];
const RADII = ["sm", "md", "lg", "xl"];

function Section({title, note, children}: {title: string; note?: string; children: React.ReactNode}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-[13px] font-medium tracking-wide text-fg-subtle">{title}</h2>
        {note ? <p className="max-w-[70ch] text-[13px] leading-relaxed text-fg-muted">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Swatch({token, label}: {token: string; label?: string}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="h-14 shadow-[inset_0_0_0_1px_var(--border)]"
        style={{background: `var(--${token})`}}
      />
      <Mono className="text-[11px] text-fg-subtle">{label ?? `--${token}`}</Mono>
    </div>
  );
}

export default function KitchenSinkPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-14 px-4 py-14 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="display text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Kitchen sink</h1>
        <p className="max-w-[65ch] text-sm leading-relaxed text-fg-muted">
          Every token and primitive, in whichever skin is active. Open the dev panel at the bottom
          left to switch, or press Ctrl + Shift + K to cycle.
        </p>
      </header>

      <Section title="GROUNDS" note="Page, elevated page, and the three surface steps that sit on them.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {GROUNDS.map((token) => (
            <Swatch key={token} token={token} />
          ))}
        </div>
      </Section>

      <Section
        title="INK"
        note="fg and fg-muted are body copy and clear 4.5:1 on every ground above. fg-subtle is for large text and decoration only, at 3:1."
      >
        <Card className="flex flex-col gap-3 p-5">
          {INK.map((token) => (
            <p key={token} className="text-sm" style={{color: `var(--${token})`}}>
              The quick brown fox jumps over the lazy dog. <Mono className="text-[11px]">--{token}</Mono>
            </p>
          ))}
        </Card>
      </Section>

      <Section title="MEANING" note="One accent, four status colors. Each has a matching -dim for fills.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {MEANING.map((token) => (
            <Swatch key={token} token={token} />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="neutral">neutral</Badge>
          <Badge tone="accent">active</Badge>
          <Badge tone="positive">unlockable</Badge>
          <Badge tone="warn">pending</Badge>
          <Badge tone="negative">withdrawn</Badge>
        </div>
      </Section>

      <Section
        title="SUPPLY"
        note="The three colors the hero canvas reads. Locked against free is the single most load-bearing ratio in the app: it has to survive a feed thumbnail and a viewer who cannot use the hue difference, so it is a brightness difference and not only a color one."
      >
        <div className="grid grid-cols-3 gap-3">
          <Swatch token="supply-field" />
          <Swatch token="supply-free" />
          <Swatch token="supply-locked" />
        </div>
        <div
          className="flex h-24 overflow-hidden shadow-[inset_0_0_0_1px_var(--border)]"
          style={{background: "var(--supply-field)"}}
        >
          <div className="w-[42%]" style={{background: "var(--supply-locked)"}} />
          <div className="flex-1 opacity-70" style={{background: "var(--supply-free)"}} />
        </div>
        <Hint>A flat stand-in for the real canvas: 42% locked, the rest still circulating.</Hint>
      </Section>

      <Section title="RADII" note="One family per skin. Nothing improvises its own corner.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {RADII.map((r) => (
            <div key={r} className="flex flex-col gap-1.5">
              <div
                className="h-14 bg-surface-2 shadow-[inset_0_0_0_1px_var(--border-strong)]"
                style={{borderRadius: `var(--radius-${r})`}}
              />
              <Mono className="text-[11px] text-fg-subtle">--radius-{r}</Mono>
            </div>
          ))}
        </div>
      </Section>

      <Section title="TYPE" note="Display carries headings. Mono carries every number, address and hash.">
        <Card className="flex flex-col gap-4 p-5">
          <p className="display text-4xl font-semibold tracking-tight text-fg">Locked until 2027</p>
          <p className="text-base leading-relaxed text-fg">Body copy at 16, capped near 65 characters so a line stays readable.</p>
          <p className="text-sm leading-relaxed text-fg-muted">Secondary copy at 14 for hints and captions.</p>
          <Mono className="text-sm text-fg">19,537,128.786868</Mono>
          <Mono className="break-all text-sm text-fg-muted">0x88e57A9F8f021Aa24bfC757675D06edFa7f0bFB0</Mono>
        </Card>
      </Section>

      <Section title="BUTTONS" note="Everything pressable scales to 0.97 on press. Hold one down.">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" size="lg">Lock supply</Button>
            <Button variant="secondary" size="lg">Review</Button>
            <Button variant="ghost" size="lg">Cancel</Button>
            <Button variant="danger" size="lg">Withdraw</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">Lock supply</Button>
            <Button variant="secondary">Review</Button>
            <Button variant="ghost">Cancel</Button>
            <Button variant="primary" disabled>Disabled</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" size="sm">Small</Button>
            <Button variant="secondary" size="sm">Small</Button>
          </div>
        </div>
      </Section>

      <Section title="FIELDS" note="Label above, helper or error below. Never a placeholder standing in for a label.">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="ks-a">Token address</Label>
            <Input id="ks-a" placeholder="0x..." className="num" />
            <Hint>Paste the contract address of the token you want to lock.</Hint>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ks-b">Amount</Label>
            <Input id="ks-b" defaultValue="19537128.786868" className="num" />
            <Hint tone="error">That is more than your balance.</Hint>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ks-c">Disabled</Label>
            <Input id="ks-c" defaultValue="Connect a wallet first" disabled />
            <Hint>Focus the fields above to see the accent ring.</Hint>
          </div>
        </div>
      </Section>

      <Section title="STATES" note="Loading matches the shape of what is coming. Empty says how to fill it.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Card className="flex flex-col gap-3 p-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </Card>
          <Empty
            title="No locks yet"
            body="Lock some supply and it will show up here with a countdown and a proof link."
            action={<Button variant="primary" size="sm">Lock supply</Button>}
          />
        </div>
      </Section>
    </main>
  );
}
