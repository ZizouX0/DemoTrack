---
name: deep-research
description: Conduct deep, multi-source web research and produce a verified, cited report. Use when the user wants an in-depth investigation, literature/market scan, comparison, or fact-checked summary on any topic. Built entirely on the agent's native web tools (WebSearch/WebFetch) — no external API key required.
metadata:
  version: "1.0.0"
  argument-hint: <research question>
---

# Deep Research

A research harness that fans out parallel web searches, fetches primary sources,
adversarially verifies claims, and synthesizes a cited report. Uses only the
agent's built-in `WebSearch` and `WebFetch` tools — no API keys or external
services.

## When to Use

Trigger when the user asks to "research", "do a deep dive", "investigate",
"compare X vs Y", "find out", or wants a thorough, sourced answer rather than a
quick lookup. For a single known fact, just use `WebSearch` directly instead.

## Workflow

### 1. Scope the question
If the request is broad or underspecified (e.g. "research the best database"),
ask 2–3 clarifying questions first (use case, constraints, region, budget,
timeframe). Weave the answers into the working question. Skip this only when the
question is already specific.

### 2. Plan the search
Break the question into 4–8 distinct sub-questions / angles. Each should target
a different facet (definitions, current state, competing views, data/benchmarks,
risks, recent developments). Write them down before searching.

### 3. Fan out searches
Run multiple `WebSearch` calls in parallel — one per sub-question, plus
variations on phrasing. Prefer recent results for anything time-sensitive
(include the current year). Collect candidate URLs.

### 4. Fetch primary sources
Use `WebFetch` to read the most promising pages directly — do not rely on search
snippets alone. Favor primary sources (official docs, papers, vendor pages,
filings) over aggregator blogs. Pull the actual numbers, quotes, and dates.

### 5. Verify adversarially
For every non-trivial claim, find a **second independent source**. Actively look
for disconfirming evidence and contradictions. Flag anything you can only find
in one place, or where sources disagree, as **low-confidence**. Distinguish
primary sources from secondary repetition. Note publication dates — discard or
caveat stale data.

### 6. Synthesize a cited report
Produce a structured report:
- **Answer / bottom line** up front (2–4 sentences).
- **Key findings**, grouped logically, each with inline source links.
- **Contradictions / open questions / confidence notes.**
- **Sources** list at the end (markdown links to every URL relied on).

Every factual claim must be traceable to a cited source. Separate established
facts from your own inference. Do not fabricate URLs or quotes — only cite pages
you actually fetched.

## Quality Bar

- Breadth: cover competing viewpoints, not just the first result.
- Depth: read sources, don't skim snippets.
- Honesty: state confidence; surface disagreement; admit gaps.
- Traceability: every claim → a real, fetched source.

## Pairs Well With

- `firecrawl-*` skills — for large-scale crawling/scraping when native WebFetch
  isn't enough (requires a Firecrawl API key).
- `docx` / `pdf` — to deliver the final report as a polished document.
