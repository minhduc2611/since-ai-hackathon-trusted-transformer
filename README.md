# TrustED PETs Transformer

Detect → Select → Transform → Demonstrate, for any dataset in `../TRUSTED_PETS_PROVING_GROUND_2026/data/` and any sharing scenario.

## Prerequisites

- Node.js 20.6+
- [Ollama](https://ollama.com) running `gemma4:12b` (used only for columns the rules cannot classify confidently)
- Python 3 with `pandas numpy scipy scikit-learn` for the `pets-eval` scorecard:
  `python3 -m pip install pandas numpy scipy scikit-learn`

## Web app

```bash
npm run setup   # installs API and web dependencies
npm run dev     # API on :8787, web on http://localhost:5173
```

Pick a dataset and table in the sidebar to browse rows page by page. Choose a sharing scenario and the tables to release, then click **Protect**. When the run finishes, the **Protected** and **PET plan** tabs and the scorecard panel show the result.

## CLI

```bash
DATASET=health SCENARIO=HEALTH-S1 npm run pipeline
DATASET=finance SCENARIO=FIN-S1 TABLES=customers,cards npm run pipeline
```

## Output

Every run writes to `out/<dataset>/<scenario>/`:

| File | Content |
|---|---|
| `field_labels.json/.csv` | Detected privacy role and subtype per column |
| `pet_plan.json/.csv` | PET chosen per column, with the reason |
| `transform_summary.json` | Released and withheld tables, k<5 before and after, cells suppressed |
| `protected/*.csv` | The protected release |
| `protected/rowmap_*.csv` | Scoring-only row maps. Never publish these. |
| `protected/scorecard.html/.json` | `pets-eval` self-assessment |

### Public trust on health (e.g. HEALTH-S2): aggregate only

No real visit row is released, and no row map is written. `src/transform/dp/` writes:
- `dp_answers.csv`: the 254 workload queries, answered with Laplace noise.
- `ed_visits.csv`: synthetic rows (`arrival_ts`, `age_band`, `diagnosis_group`) rebuilt only from noisy counts.
- `published_weekly_stats.csv`: the dashboard. Cells under 5 and one complementary cell per group are left out, and the `all` row keeps the total.

Budget (event-level, one visit = one record): ε=1 per weekly release (week × age band × diagnosis group cube) plus ε=1 for the annual summary. That is ε=2 per visit in total. Details are in `transform_summary.json` → `dp`. Self-check: `npx tsx src/transform/dp/selfcheck.ts`.

## API

All paginated endpoints return `{ success, data, pagination: { total, limit, offset, current_page, total_pages, has_next, has_previous } }`.

| Method | Path |
|---|---|
| GET | `/api/datasets` |
| GET | `/api/scenarios?dataset=health` |
| GET | `/api/datasets/:dataset/tables/:table/rows?limit=50&offset=0` |
| POST | `/api/protect` with `{ dataset, scenario, tables[] }` |
| GET | `/api/jobs/:id` |
| GET | `/api/results/:dataset/:scenario` |
| GET | `/api/results/:dataset/:scenario/tables/:table/rows?limit&offset` |
| GET | `/api/results/:dataset/:scenario/scorecard.html` |
