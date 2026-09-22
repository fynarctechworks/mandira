# Usability studies — the two Mandhira's requirements depend on

Two requirements in the registry cannot be closed by writing code, because they are claims
about what happens in a person's head:

| Requirement | The claim | The bar |
|---|---|---|
| PRD-DISC-008 | Top-3 significance, availability and booking are discoverable in ≤ 60 s and ≤ 3 screens | every participant, or the design changes |
| PRD-LIVE-005 | What / when / where is readable in ≤ 5 s | ≥ 90 % task success, n ≥ 10 |

Everything they measure is built. What is missing is ten people and about two hours. This
document is the protocol, so running them needs no study design — only recruiting.

**Run both in the same session with the same people.** They take about twelve minutes each
per participant, they need the same setup, and a person who has just built a journey is
exactly who should then be shown a Live screen.

---

## Before the day

**Recruit ten people who have been on a pilgrimage, or are planning one.** Not colleagues,
not anyone who has seen the app. Mixed ages — at least three over 55, because the product
is built around travelling with elders and their reading of a screen is the one most likely
to differ from yours. At least four who would use Telugu or Hindi rather than English.

**One phone, not theirs.** A mid-range Android with the app installed and signed in as a
test account. Same device for everyone: you are measuring the design, and a participant's
own phone brings their brightness, their font size and their notifications with it.

**Set the phone up before each participant arrives.** For the discovery task, the app open
at Home, no journey in progress, and the destination content loaded. For the Live task, a
journey seeded to be mid-day with a NOW card showing. Re-seed between participants —
somebody arriving to a half-finished task measures nothing.

**Say this, once, and then stop talking:**

> I am testing the app, not you. If something is confusing, that is the app's fault and it
> is exactly what I need to find out. Please say out loud what you are thinking, even when
> it is "I don't know what this means". I will not be able to help you while you are
> working, and that is on purpose.

Then do not help. Not a hint, not a nod at the right part of the screen. The silence is the
measurement. Write down where they get stuck; that is the finding.

---

## Study 1 — PRD-DISC-008: 60-second comprehension

### The task, read aloud exactly

> You are planning a pilgrimage to **[the launch destination]**. Using this app, find out:
> the three most significant things to do there, when the main one is available, and
> whether it needs booking in advance. Tell me when you have all three.

### What to record

Start a stopwatch as you finish the sentence. For each participant, note:

| Field | Note |
|---|---|
| Time to all three | Stop the clock when they say all three, not when you see them find them |
| Screens visited | Count distinct screens, not taps. Back counts as a screen |
| Which of the three they found | Significance / availability / booking — separately |
| Where they hesitated | The first place they paused over three seconds, in their words |
| What they expected to be somewhere it wasn't | The most useful thing you will collect |

Stop at **120 seconds** whether or not they are finished, and record it as a fail. Past
two minutes you are measuring persistence rather than design.

### The bar

The requirement is ≤ 60 seconds and ≤ 3 screens. Treat **8 of 10 within 60 seconds** as a
pass, and anything less as the design's problem. If the same participant finds
significance quickly and booking slowly, that is not one failure — it is a finding about
where booking information lives.

---

## Study 2 — PRD-LIVE-005: 5-second comprehension

This one is a flash, not a task. It measures whether the NOW card says what it is for.

### How to run it

1. Hand the phone over face down.
2. Say: *"When I say go, turn it over and look for five seconds. Then turn it back down."*
3. Time five seconds. Take the phone back.
4. Ask, in this order, and write their exact words:
   - **What** are you meant to be doing?
   - **When**?
   - **Where**?

Do not re-show the screen between questions. Do not accept "I think it said…" as a yes —
if they are unsure, it is a no.

### Scoring

One point each for what, when and where. A participant **succeeds** only with all three.
The requirement is ≥ 90 % success at n ≥ 10, so **9 of 10 participants getting all three**
is the bar.

Record which of the three fails most. One dimension failing across several people is a
design finding with an obvious fix; three failing on one person is usually that person
having looked at the wrong part of the screen, which is also a finding.

### Run it twice per participant

Once on a NOW card for something **about to start**, once for something **under way**. They
read differently and the second is the one travelers see most.

---

## After

Write the numbers into `docs/PROJECT_STATUS.md` against PRD-DISC-008 and PRD-LIVE-005, with
the date and the sample size. A number without its n is not a result.

If either bar is missed, the finding belongs in `docs/DECISION_LOG.md` with what you saw —
not "discovery was slow" but "six of ten looked for booking inside the experience and it
is on the practical section below it". The first cannot be acted on; the second is a
half-hour change.

**Do not soften a miss.** These two requirements exist because a pilgrim reads a screen in
a queue, in the sun, holding somebody's hand. A study that reports what you hoped for is
worse than no study, because it closes the question.
