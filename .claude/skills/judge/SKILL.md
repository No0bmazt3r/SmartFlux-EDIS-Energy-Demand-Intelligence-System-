---
name: judge
description: Run a mock Open Agent Hackathon 2026 judging panel on SmartFlux EDIS using docs/judges-validation.md. Checks the 14 pass/fail gates against the actual repo, scores the six criteria (Impact 30, Technical 20, Innovation 15, Demo 15, Product & UX 10, Sponsor Tech 10) as three independent judges, asks the panel questions, and returns a score sheet with fix tickets. Use when the user says "judge", "/judge", "score the submission", "mock panel", "are we ready to submit", "how would judges rate this", or asks to validate the repo, README, demo or deck against the rubric.
---

# Judge: SmartFlux mock panel

The source of truth is `docs/judges-validation.md`. Read it in full first, every run. It may have changed; never score from memory. Use its gates (§3), anchors (§4), questions (§5), score sheet (§6) and red flags (§8) exactly as written.

## Rules

- **Evidence or zero.** Every gate tick and every score cites a file path, log line, test output or command result. A doc that *plans* a feature is not evidence that it exists. Say "planned, not built" and score what is built.
- **Judge what a judge gets.** Base the scores on the repo, README, demo video and deck. If the video or deck is missing, say so and score Demo against what the repo shows.
- **No git commands.** Inspect files directly. For G1 (public repo), check the GitHub URL with `curl -sI` and no auth.
- **Never invent user evidence.** For B2 ("have you talked to an owner?"), use only `docs/user-research.md` and any notes under `docs/smartflux/research/`. If there are none, say "no owner interview yet" and apply the −3 to −4 Impact penalty from §7.
- **Be a hard judge.** Score a little below what you think it deserves. The real panel will not give the team the benefit of the doubt.

## Procedure

1. **Gates (§3).** Check G1 to G14 against the repo. For each, record pass, fail or not yet built, with the evidence. Useful checks:
   - G7/G8: run the sample-mode examples with an empty `.env` if code exists; confirm outputs differ across inputs; grep for reads of `output_examples/`.
   - G9: grep `logs/*.jsonl` for `target_agent` and `needs_revision`.
   - G10: grep for key-shaped strings (`sk-`, `nvapi-`, `api_key=`, `Bearer `) and confirm `.env` is not committed.
   - G4: run `pnpm test` and quote the `memory.test.ts` result.
2. **Three judges (§2).** Score independently as the Technical, Business and Sponsor judge. Put each score inside the band its anchor describes in §4, and give a one-line reason and the biggest fix.
3. **Panel questions (§5).** Ask each judge's questions (T1 to T8, B1 to B8, S1 to S6, H1 to H4). For each, check whether the "Proof" column exists in the repo. Mark the answer **holds**, **weak** (claimed, proof thin) or **fails** (no proof).
4. **Aggregate (§1.6).** Take the median per criterion. Raise a fix ticket for any criterion where the judges differ by more than 30% of its points.
5. **Red flags (§8).** List any you find, at the top of the report.

## Output

```
## Verdict: <median total>/100, <n> gates failed: <ready | not ready>
Red flags: <list or none>

### Gates
| # | Gate | Result | Evidence |

### Scores
| Criterion | Max | Tech | Biz | Sponsor | Median | Reason | Biggest fix |

### Panel questions that did not hold
| # | Question | Status | What is missing |

### Fix tickets (highest point gain first)
1. <fix>: about +<n> pts, <criterion>, <file or artefact to change>
```

The submission is ready when the median is at least 85 and no gates fail (§1.7). Otherwise, say plainly that it is not ready. Compare the result with the team's self-assessment in §7 and point out where the self-score is too generous.

If the user names one area (for example `/judge sponsor` or `/judge gates`), run only that part.
