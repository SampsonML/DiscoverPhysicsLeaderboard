# DiscoverPhysics — website

Static site for the DiscoverPhysics benchmark. The browser fetches `data/results.json` (generated from the .txt summaries in `model-results/`) and renders the leaderboard plus a per-world heatmap. Plain HTML, CSS, and one JavaScript file.

## Run locally

The data file is committed, so the dev loop is just:

```bash
python -m http.server 8000        # or:  npx serve .
```

Then open <http://localhost:8000>.

After editing anything in `model-results/` (or the renaming/normalization rules in `build_data.py`), regenerate:

```bash
python build_data.py              # writes data/results.json
```

CI runs the same command on every PR and fails if `data/results.json` is out of date with the .txt files.

## Deploy to GitHub Pages

1. Push the repo to GitHub.
2. **Settings → Pages → Build and deployment**: source = "Deploy from a branch", branch = `main`, folder = `/ (root)`.
3. The site will be at `https://<user>.github.io/<repo>/`.

## Project structure

```
.
├── index.html                  # landing page
├── style.css                   # all styling
├── leaderboard.js              # fetches JSON, builds table & heatmap
├── build_data.py               # parses model-results/*.txt → data/results.json
├── data/
│   ├── results.json            # generated leaderboard entries
│   └── worlds.json             # canonical world list (id, name, equation, …)
├── schema/
│   └── result.schema.json      # JSON Schema for one results entry
├── model-results/
│   ├── averaged/summary_per_model.txt
│   └── per_world/summary.txt   # raw .txt summaries — source of truth
├── figures/                    # PNG figures from the paper
└── .github/workflows/
    └── validate.yml            # regenerate + schema-validate on PR
```

## Adding figures

Drop the PNG figures from the paper into `figures/`:

| File              | Source                        |
| ----------------- | ----------------------------- |
| `pipeline.png`    | Fig. 1 (benchmark schematic)  |
| `pareto.png`      | Fig. 2 left panel             |
| `passk.png`       | Fig. 2 middle panel           |
| `rounds.png`      | Fig. 3 (guided vs random)     |

The site degrades gracefully if any are missing. The per-world heatmap section is rendered live from `data/results.json`, so no figure is needed for it.

## Adding the paper PDF

Drop the compiled PDF as `paper.pdf` in the root.

## Submitting results

The numeric leaderboard is generated from the two .txt files under `model-results/`. To add a model:

1. Run the DiscoverPhysics evaluation harness on the new model.
2. Append the new model's row(s) to:
   - `model-results/averaged/summary_per_model.txt` (one row, pooled across worlds and seeds)
   - `model-results/per_world/summary.txt` (one row per world)
3. `python build_data.py`
4. Commit `model-results/...` and the regenerated `data/results.json`, then open a PR.

`build_data.py` strips provider prefixes (e.g. `together/openai/gpt-oss-120b` → `gpt-oss-120b`) and renames the `coulomb_easy` world to `coulomb` to match `data/worlds.json`. The CI workflow fails if the committed `data/results.json` doesn't match what the script produces, or if any entry violates `schema/result.schema.json`, or if a model entry's per-world keys don't match the world ids in `data/worlds.json`.

## De-anonymizing for the camera-ready

Author info lives in **one place**: the `<p class="author-line">` block in `index.html`. Replace `Anonymous Authors` with the real author list and you're done.

## Customizing

- **Domain**: to use a custom domain, add a `CNAME` file containing the bare domain (e.g. `discoverphysics.org`) and configure DNS at your registrar (CNAME → `<user>.github.io`). Enforce HTTPS in Pages settings.
- **Color accent**: `--accent` in `style.css` is the only hot color used. Change it once and the entire site retones, including the heatmap shading.
- **Adding a new world**: append to `data/worlds.json`. The grid auto-renders. The world id must also appear in every model's per-world summary in `model-results/per_world/summary.txt`, or `validate.yml` will fail.
