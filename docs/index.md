---
hide:
  - toc
---

# Daily Social Signals

<div class="hero-tagline">
Daily social signals — surfacing themes, pain points, and emerging tool activity across Reddit and Twitter.
</div>

---

## Latest Reports

<div class="grid cards" markdown>

-   :material-reddit: **Reddit · AI Agents**

    ---

    Community pulse from r/AI_Agents, r/aiagents, and r/AgentsOfAI — ranked by engagement score, grouped into themes with pain point and opportunity annotations.

    {% for r in list_reports("reddit", "ai-agent", 7) %}[{{ r.label }} →]({{ r.path }}){ .md-button{% if loop.first %} .md-button--primary{% endif %} } {% endfor %}

-   :fontawesome-brands-x-twitter: **Twitter · AI Agents**

    ---

    Builder and researcher signals from curated Twitter searches — scored by engagement with reply-chain context included for top posts.

    {% for r in list_reports("twitter", "ai-agent", 7) %}[{{ r.label }} →]({{ r.path }}){ .md-button{% if loop.first %} .md-button--primary{% endif %} } {% endfor %}

</div>

---

## About

Harvester runs automated monitors that collect posts from configured subreddits and Twitter searches. Raw JSON snapshots are processed daily into structured briefings — themes, pain points, unmet needs, and emerging tool signals — using engagement-based ranking and cross-post deduplication.

| Source | Topic | Reports |
|---|---|---|
| Reddit | AI Agents | {% for r in list_reports("reddit", "ai-agent") %}{{ r.label }}{% if not loop.last %}, {% endif %}{% endfor %} |
| Twitter | AI Agents | {% for r in list_reports("twitter", "ai-agent") %}{{ r.label }}{% if not loop.last %}, {% endif %}{% endfor %} |

Reports are generated from `data/<source>/<topic>/<date>.json` snapshots collected automatically by the configured monitors.
