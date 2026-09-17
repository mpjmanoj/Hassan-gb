const STEPS = [
  {
    step: "01",
    title: "Worker starts the route",
    body: "The collection crew signs in and presses Start Work. The vehicle's GPS switches on for the shift.",
  },
  {
    step: "02",
    title: "Location reaches Swachhata",
    body: "Every few seconds the vehicle's position is verified and stored — the phone is never trusted on its own.",
  },
  {
    step: "03",
    title: "You see it move",
    body: "Your ward's vehicle appears on the map and keeps moving, so you know exactly when to be ready.",
  },
];

export function HowItWorks() {
  return (
    <section className="mx-auto w-full max-w-5xl px-5 py-16 sm:py-24" id="how-it-works">
      <p className="label">How it works</p>
      <h2 className="mt-3 max-w-xl text-[28px] font-bold leading-tight tracking-tight sm:text-[36px]">
        From the collection vehicle to your screen
      </h2>

      <ol className="mt-10 grid gap-4 sm:grid-cols-3">
        {STEPS.map(({ step, title, body }, index) => (
          <li key={step} className="relative card p-6">
            <span className="text-[13px] font-bold tracking-[0.12em] text-brand">{step}</span>
            <h3 className="mt-3 text-[17px] font-semibold leading-snug">{title}</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">{body}</p>
            {index < STEPS.length - 1 ? (
              <span
                aria-hidden
                className="absolute -right-2 top-1/2 hidden h-px w-4 bg-line sm:block"
              />
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
