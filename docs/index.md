---
hide:
  - toc
---

# Daily Social Signals

<div class="hero-tagline">
Social media signal briefings — themes, pain points, and emerging topics from Reddit and Twitter. For educational purposes only.
</div>

---

## Latest Reports

<div class="grid cards" markdown>

-   :material-reddit: **Reddit · AI Agents**

    ---

    Daily briefings from popular AI Agent subreddits — key themes, pain points, and emerging topics.

    {% for r in list_reports("reddit", "ai-agent", 7) %}[{{ r.label }} →]({{ r.path }}){ .md-button{% if loop.first %} .md-button--primary{% endif %} } {% endfor %}

-   :fontawesome-brands-x-twitter: **Twitter · AI Agents**

    ---

    Daily briefings from AI Agent discussions on Twitter — key themes, signals, and emerging topics.

    {% for r in list_reports("twitter", "ai-agent", 7) %}[{{ r.label }} →]({{ r.path }}){ .md-button{% if loop.first %} .md-button--primary{% endif %} } {% endfor %}

</div>

---

## About

Daily social media trend and signal analysis briefings — surfacing themes, pain points, unmet needs, and emerging topics from Reddit and Twitter. For educational purposes only.
