# Courtesy outreach to @benjitaylor (Agentation author)

Re-agentation is an independent React Native re-implementation of the
annotate-then-edit UX that Agentation pioneered for the DOM/React. As a
courtesy (not a license obligation — both are MIT), let the original author
know it exists and offer collaboration.

**How to send**: easiest is a friendly GitHub issue or Discussion on
https://github.com/benjitaylor/agentation, or email if you have it.

---

## Draft (GitHub issue / Discussion)

**Title**: Built a React Native port — Re-agentation (credit + hello 👋)

Hi @benjitaylor,

I love what Agentation does for web/React — the "click an element, leave a
comment, let the agent edit the right file" loop is genuinely great DX.

I built a React Native version of the same idea and wanted to give you a
heads-up out of courtesy. It's called **Re-agentation**:

- Repo: https://github.com/Re-agentation/re-agentation
- npm: `@re-agentation/probe`, `@re-agentation/metro`, `@re-agentation/mcp`

It's an independent implementation (RN works completely differently from the
DOM — it walks the React fiber tree, reads React 19's `_debugStack`, and uses
Metro's `/symbolicate` to recover the source location, then hands batches to
the coding agent over MCP). Your project is credited prominently in the README
as the inspiration ("Inspired by Agentation"), with a link back here.

Both are MIT, so there's nothing you need to do — I just didn't want to ship a
clear homage to your work without saying hi. If you'd ever want to cross-link,
collaborate, or even fold an "official RN port" under the Agentation umbrella,
I'm very open to it. And if you'd prefer any wording changed in how I credit
you, just say the word.

Thanks for the inspiration!

— Jay

---

## Draft (short email version)

Subject: React Native port of Agentation — credit + hello

Hi Benji,

I built a React Native version of Agentation called Re-agentation
(https://github.com/Re-agentation/re-agentation, on npm as
`@re-agentation/*`). It's an independent implementation but clearly inspired
by your work, and I've credited Agentation prominently in the README.

Both are MIT so nothing's required on your end — I just wanted to reach out as
a courtesy and say thanks for the original idea. Happy to adjust the credit
wording or collaborate / cross-link if you're interested.

Best,
Jay
