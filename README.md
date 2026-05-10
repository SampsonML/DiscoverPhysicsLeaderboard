# DiscoverPhysics — website

Static site for the DiscoverPhysics benchmark. No build step, no framework — plain HTML, CSS, and one JavaScript file that fetches `data/results.json` and renders the leaderboard.

## Run locally

```bash
# any static server works
python -m http.server 8000
# or
npx serve .
```

Then open <http://localhost:8000>.

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. **Settings → Pages → Build and deployment**: source = "Deploy from a branch", branch = `main`, folder = `/ (root)`.
3. Wait ~30 seconds. The site will be at `https://<user>.github.io/<repo>/`.

The `.nojekyll` file disables Jekyll processing so `data/` and `schema/` are served as-is.

## Project structure

```
.
├── index.html              # the landing page
├── style.css               # all styling
├── leaderboard.js          # fetches JSON, builds table
├── data/
│   ├── results.json        # leaderboard entries (one per model)
│   └── worlds.json         # world descriptions
├── schema/
│   └── result.schema.json  # JSON Schema for validating new entries
├── figures/                # PNG figures from the paper
└── .github/workflows/
    └── validate.yml        # CI check for submissions
```

## Adding figures

Drop the PNG/PDF figures from the paper into `figures/`:

| File              | Source                                  |
| ----------------- | --------------------------------------- |
| `pipeline.png`    | Fig. 1 (benchmark schematic)            |
| `pareto.png`      | Fig. 2 left panel                       |
| `passk.png`       | Fig. 2 middle panel                     |
| `heatmap.png`     | Fig. 4 top panel                        |
| `rounds.png`      | Fig. 3 (guided vs random)               |

The site degrades gracefully if any are missing — they show a placeholder.

## Adding the paper PDF

Drop the compiled PDF as `paper.pdf` in the root.

## Submitting results

Contributors fork the repo, append one entry to `data/results.json` matching the shape in `schema/result.schema.json`, and open a PR. The GitHub Action validates the schema before merge.

A minimal entry looks like:

```json
{
  "model": "your-model-id",
  "model_display": "Your Model",
  "organization": "Your Org",
  "type": "open-source",
  "release_date": "2026-05",
  "explanation_score": { "mean": 0.0, "se": 0.0 },
  "normalized_mse": { "mean": 0.0 },
  "pass_at_k": {
    "1": { "mean": 0, "se": 0 },
    "2": { "mean": 0, "se": 0 },
    "3": { "mean": 0, "se": 0 },
    "4": { "mean": 0, "se": 0 },
    "5": { "mean": 0, "se": null }
  },
  "per_world_explanation": {
    "gravity": 0.0, "yukawa": 0.0, "hubble": 0.0,
    "ether": 0.0, "oscillator": 0.0, "circle": 0.0,
    "extra_dimensions": 0.0, "fractional": 0.0,
    "dark_matter": 0.0, "three_species": 0.0, "coulomb": 0.0
  },
  "submission": {
    "submitted_by": "your-github-handle",
    "submission_date": "2026-05-10",
    "rounds_budget": 16,
    "experimentation_mode": "guided",
    "notes": null
  }
}
```

## De-anonymizing for the camera-ready

Author info lives in **one place**: the `<p class="author-line">` block in `index.html`. Replace `Anonymous Authors` with the real author list and you're done.

## Customizing

- **Domain**: to use a custom domain, add a `CNAME` file containing the bare domain (e.g. `discoverphysics.org`) and configure DNS at your registrar (CNAME → `<user>.github.io`). Enforce HTTPS in Pages settings.
- **Color accent**: `--accent` in `style.css` is the only hot color used. Change it once and the entire site retones.
- **Adding a new world**: append to `data/worlds.json`. The grid is auto-rendered.
