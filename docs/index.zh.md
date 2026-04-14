---
hide:
  - toc
---

# 每日社交信号

<div class="hero-tagline">
社交媒体信号简报 — 来自 Reddit 和 Twitter 的主题、痛点和新兴话题。仅供教育用途。
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
