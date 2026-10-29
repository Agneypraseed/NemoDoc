# Product capability goal

The goal covers word-level editing of generated material, flexible formats including tables or nested pages, coherent source management and source-location navigation, a graph of notebook data, an intuitive cohesive interface, and AI insights personalized to learning. Completion needs direct evidence for every requirement; the existence of an isolated component is insufficient.

## Initial audit and stages

1. Editing: Studio has title/content/card editors. Whole-notebook notes and annotations are editable. Generated chat answer editing and consistency across saved answers, exports and streamed responses still need inspection and implementation where missing.
2. Display: Studio supports guides, cards, quizzes and generated mind maps, with Markdown tables in guides. This does not yet establish flexible organization across notes. The notebook connection view adds graph/table switching; nested note organization remains to assess.
3. Sources: existing reader, source list, citations, note search and passage annotations provide source navigation. Deletion, stale references, discoverability and persistence across the complete study journey remain to verify.
4. Structure graph: new Graph workspace tab displays actual notebook membership and valid source-page references across notes, saved answers and study artifacts. No inferred semantic links are presented as evidence. Search, source filtering, an inspector, table display and source-page/note navigation are included. Fixture browser proof now covers a cited saved answer, opening its original PDF page, Graph/Table switching, search, reload, opening the saved note, and mobile overflow. `tests/notebook-graph.test.ts` verifies source scope, stale-page exclusion, uncited evidence exclusion and notebook membership. Screenshots were visually inspected; narrow panels stack graph nodes vertically. The full four-part product goal is still incomplete.
5. Personalized AI insights: Studio records quiz results and Agent has weak-topic/exam-prep skills, but the learning feedback loop and discoverability remain to assess and verify.

Next stages must close these gaps and verify the integrated workflows before the goal is marked complete. Commit each coherent stage locally; do not push without authorization.
