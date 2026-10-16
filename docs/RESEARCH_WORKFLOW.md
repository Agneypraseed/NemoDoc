# Research synthesis: try it with two open papers

NemoDoc's research workflow compares selected sources through a cited evidence table. Import papers yourself with **Add source**; this guide does not download them or send them to the server automatically.

## Sample papers

These two open-access articles study retrieval practice in different settings. Their article pages state that they are published under a Creative Commons Attribution license:

- Ritchie et al. (2013), _Retrieval Practice, with or without Mind Mapping, Boosts Fact Learning in Primary School Children_: [article](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0078976) · [PDF](https://journals.plos.org/plosone/article/file?id=10.1371/journal.pone.0078976&type=printable)
- Okano et al. (2018), _Enhancing workplace digital learning by use of the science of learning_: [article](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0206250) · [PDF](https://journals.plos.org/plosone/article/file?id=10.1371/journal.pone.0206250&type=printable)

Download each PDF and add both to a notebook. In **Agent → Tasks → Synthesize research**, approve snapshots for both papers and select them for the run. You can also select notes linked to those papers. NemoDoc requires two selected sources before it enables the run.

Try this request:

> Compare how retrieval practice is studied in these papers. For each paper, summarize the finding, method or population, and cited page. Explain what the different settings let us conclude and what they do not. Draft a short cited brief and suggest a follow-up reading task.

The report separates one row per selected paper from cross-paper comparisons. Each finding links to page buttons that open the source. Comparison labels mean:

- **Supports:** passages from at least two selected papers support the stated comparison.
- **Qualifies:** evidence narrows or contextualizes the comparison, such as different populations or outcomes.
- **Conflicts:** evidence points in opposing directions on a comparable claim; the citations must come from both papers.
- **Insufficient evidence:** the selected passages do not support a fair comparison.

These papers examine primary-school learning and workplace digital learning, so their results are not a direct head-to-head experiment. The workflow should surface that limit instead of presenting the papers as a disagreement. Claims the selected evidence cannot establish appear under **Not established by these papers**.

Review the cited passages and edit the proposed brief or follow-up task. No material or review is saved until you approve its action. NemoDoc checks that report citations are returned citations from selected sources and that a comparison labeled supports, qualifies, or conflicts cites two distinct sources. Those checks establish reference integrity, not that a model's wording accurately represents the papers; inspect the pages before approving.

## Study revision with MML

For **Plan revision**, select the MML book and one or more saved notes. If you choose **Use shared quiz progress**, the report distinguishes actual recorded mistakes from mastery and keeps an empty quiz history explicitly unknown. Each focus links to note IDs, any recorded mistaken attempt IDs, and cited book pages. Practice materials and review sessions remain editable proposal actions until approved.

## What the tests establish

Credential-free tests use clearly marked synthetic extracts for the two-paper workflow and synthetic MML notes/quiz history. They test report schema, selected-source references, missing-progress states, action editing, approvals, duplicate-safe imports, and JSON/PostgreSQL persistence. They do not score the model's factual accuracy. For a real synthesis, import the two PLOS PDFs above and run the connected Nemotron model on your approved snapshots.
