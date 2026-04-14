---
hide:
  - toc
---

# AI Pulse Daily

<div class="hero-tagline">
Daily AI pulse from the social web — trends, breakthroughs, pain points, and emerging topics.
</div>

---

## Latest Reports

<div class="grid cards" markdown>

{% for t in list_all_topics(3) %}
-   {{ t.source_icon }} **{{ t.source_label }} · {{ t.topic_label }}**

    ---

    {{ t.description }}

    {% for r in t.reports %}[{{ r.label }} →]({{ r.path }}){ .md-button{% if loop.first %} .md-button--primary{% endif %} } {% endfor %}

    [View all →]({{ t.source }}/{{ t.topic }}/index.md){ .md-button }

{% endfor %}
</div>
