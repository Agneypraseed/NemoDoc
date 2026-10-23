# Homepage

## Sub-features

Public introduction, in-page navigation, feature walkthroughs, local-only agent illustration, FAQ, and entry into the notebook workspace.

## How to get to it (user POV)

Open `/`. `Open NemoDoc` in the header or `Open your notebook` in the hero opens `/app`. Existing notebooks remain at the same browser origin, so changing this path does not move their IndexedDB data.

## Driving it with Playwright

Run `npm run verify:agents -- home.spec.ts`. Choose `Read & annotate`, toggle `Remove highlight` / `Highlight passage`, choose `Ask in context`, and follow the example page citation. The example document changes to page 04. Choose `Make it stick`, then `Reveal answer` and `Show question`. Choose `Meet your agents` and `Preview a workflow`; step through reading, drafting and review, then restart. `Preview animations` pauses/resumes the illustration. The example is explicitly labeled and makes no API requests. Open the backup FAQ, use `How it works` to navigate to its section, then enter `/app`, reload and navigate back. The desktop journey checks no browser errors. The mobile journey opens `Toggle navigation`, chooses Features, flips a flashcard, checks 320/390/768px widths, then opens the workspace. Screenshots are `output/home-desktop.png` and `output/home-mobile.png`.

## Gotchas

The homepage is a feature preview, not a running notebook or connected agent. No credentials, inference, email, or runtime writes occur in the walkthrough. AI and delivery features require connections configured in the workspace. PDFs are imported in the workspace, not on the homepage. Local notebooks do not automatically sync between devices. Browser tests for the notebook must navigate to `/app`; only homepage tests should start at `/`.

The introduction uses concise feature labels, `Get started` and `Features` headings, and one primary notebook action. Decorative hero copy and the repeated closing call to action have been removed.
