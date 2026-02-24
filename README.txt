# BillerMailer (BM)

Interim billing + invoice review tool for Chisholm Trail Transportation.

## Purpose
- Ingest TripMaster CSV exports
- Group trips by facility and billing period
- Provide a slick local review UI for Include / Exclude / Modify / Move
- Generate clean invoice inputs (PDF generation forthcoming)

## Workflow
1. Export TripMaster CSV
2. Run `BM Review.cmd`
3. Review trips in browser
4. Generate invoices

## Status
Active development. Interim tool while Trip Engine (TE) is under development.

## Notes
- Status is not filtered at ingest
- Private Pay and CTT Comp are excluded automatically