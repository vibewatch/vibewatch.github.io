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
-   {{ t.source_icon }} **{{ t.source_label }} · {{ t.topic_label }}** <a href="{{ t.source }}/{{ t.topic }}/" class="card-arrow" title="View all"><span>All</span><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg></a>

    ---

    {{ t.description }}

    {% for r in t.reports %}[{{ r.label }}]({{ r.path }}){ .md-button{% if loop.first %} .md-button--primary{% endif %} } {% endfor %}

{% endfor %}
</div>
