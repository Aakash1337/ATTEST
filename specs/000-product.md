# Spec 000 — Product

**Status:** Accepted · Derives from [docs/01-product-spec.md](../docs/01-product-spec.md)

## Problem
Vendor security questionnaires (100-300 items) are answered by hand from stale spreadsheets.
Failure modes: staleness, inconsistency, unfounded confidence, and invisible gaps.

## Thesis
> The valuable output is not the answer. It is the answer **plus the evidence**, or an
> honest statement that the evidence does not exist.

Grounding enforcement is the product, not a safety feature. Abstention is a first-class
output, not an error path.

## Core release scope
CAIQ v4 XLSX only. One evidence model covering document chunks and live observations.
Extensions (SIG, `lookup_prior_answer`, resume, OCR/DOCX, conversation summarisation) are
built only after the nine release gates are green.

## Done
The nine release gates in [docs/11-delivery-plan.md §6](../docs/11-delivery-plan.md).
