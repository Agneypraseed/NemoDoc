# Notebook library

## Sub-features

Search, sort, create, reopen and browser persistence.

## How to get to it (user POV)

Open `/app`, then use the notebook library in the sidebar and open or create a notebook.

## Driving it with Playwright

Run `npm run verify:agents -- library.spec.ts` with port 4179 reserved for the isolated production-build instance. The existing library spec creates and reopens notebooks through the UI, searches and sorts them, then checks persistence. Choose `All notebooks`, then `New notebook` in the `Your notebooks` dialog. Fill `Notebook title` and `A little context`, then choose `Create notebook`. Reopen the library; use `Sort notebooks`, `Find a notebook`, and `Clear search`. Open Algebra and reload: its heading must still appear. Capture a trace with `--trace on` when gathering proof.

## Gotchas

Included in the default verification command. Standard development Playwright can reuse an existing server outside CI; check ownership first and never point verification at personal storage. Browser contexts isolate IndexedDB; server data must also be disposable.
