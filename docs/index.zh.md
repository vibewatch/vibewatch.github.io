---
hide:
  - toc
---

# AI趋势速递

<div class="hero-tagline">
每日AI趋势速递 — 从Reddit和Twitter捕捉趋势、热点、痛点与新兴话题。
</div>

---

## 最新报告

<div class="grid cards" markdown>

{% for t in list_all_topics(3) %}
-   {{ t.source_icon }} **{{ t.source_label }} · {{ t.topic_label }}**

    ---

    {{ t.description }}

    {% for r in t.reports %}[{{ r.label }} →]({{ r.path }}){ .md-button{% if loop.first %} .md-button--primary{% endif %} } {% endfor %}

    [查看全部 →]({{ t.source }}/{{ t.topic }}/index.md){ .md-button }

{% endfor %}
</div>
