# Real receipt validation

Evaluation date: 20 October 2026. These are seven existing photographed receipts, not generated receipt images. Originals, downloaded annotations, OCR text and account-specific review links remain outside this repository. This note records the corpus and its limits; seven selected examples do not establish general production accuracy.

## Corpus and attribution

Five photos come from [CORD v2, NAVER CLOVA](https://huggingface.co/datasets/naver-clova-ix/cord-v2). Attribution: Seunghyun Park, Seung Shin, Bado Lee, Junyeop Lee, Jaeheung Surh, Minjoon Seo and Hwalsuk Lee, _CORD: A Consolidated Receipt Dataset for Post-OCR Parsing_, 2019. The [official project](https://github.com/clovaai/cord) provides [CC BY 4.0 licensing](https://github.com/clovaai/cord/blob/master/LICENSE-CC-BY). Dataset split and row below identify the source without expiring image URLs. Receipt dates in these five public images are blurred; the required result is an empty date.

Two photos come from the official [GoogleCloudPlatform Document AI samples](https://github.com/GoogleCloudPlatform/document-ai-samples/tree/main/web-app-pix2info-python), under the repository's [Apache 2.0 license](https://github.com/GoogleCloudPlatform/document-ai-samples/blob/main/LICENSE). Their published extraction JSON is a model reference, not independent human ground truth. Amounts and dates were also checked against the photos. No Google extraction API is used by the app or this evaluation.

Expected amount means the final receipt total, including applicable taxes and discounts. Cash tendered, change, unit price and pretax subtotal are separate values. A merchant, payment network or compatible-device name does not establish a product's brand. Empty brand/date results are deliberately scored as correct where the photo cannot support a value.

| Case                  | Source                                                                                                                                                                    | Expected brand                          | Final amount | Purchase date  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------ | -------------- |
| `cord-validation-002` | CORD validation, row 2                                                                                                                                                    | Ovaltine                                | IDR 20,000   | Empty: blurred |
| `cord-validation-005` | CORD validation, row 5                                                                                                                                                    | LE MINERAL, preserving printed spelling | IDR 8,000    | Empty: blurred |
| `cord-train-004`      | CORD train, row 4                                                                                                                                                         | Empty                                   | IDR 48,000   | Empty: blurred |
| `cord-test-012`       | CORD test, row 12                                                                                                                                                         | Empty                                   | IDR 120,000  | Empty: blurred |
| `cord-test-018`       | CORD test, row 18                                                                                                                                                         | Empty                                   | IDR 156,000  | Empty: blurred |
| `google-receipt`      | [Grocery receipt photo](https://github.com/GoogleCloudPlatform/document-ai-samples/blob/main/web-app-pix2info-python/src/samples/3-EXPENSE_PROCESSOR/a.%20Receipt.png)    | Empty                                   | EUR 12.50    | 2021-07-25     |
| `google-enrichments`  | [Museum receipt photo](https://github.com/GoogleCloudPlatform/document-ai-samples/blob/main/web-app-pix2info-python/src/samples/3-EXPENSE_PROCESSOR/b.%20Enrichments.jpg) | Empty                                   | EUR 9.50     | 2022-12-11     |

## Initial observations

Before the changes, seven actual Tesseract OCR runs followed by the label fallback left all seven amounts empty, missed both positive brand examples and missed both legible dates. Five absent brands and all five blurred dates correctly remained empty. This established omissions in the local fallback; it was not an NVIDIA field-extraction accuracy result.

Two initial live app uploads exposed additional problems:

- `cord-validation-002`: the app filled 100,000 from cash tendered instead of the final 20,000 total. The readable brand was omitted and currency incorrectly stayed INR; the blurred date correctly remained empty.
- `google-receipt`: EUR was detected, while the 12.50 total and readable 2021-07-25 purchase date were omitted. Its absent product brand correctly remained empty.

These observed live fields alone do not prove which OCR/extraction provider supplied them. Provider methods and fallback status must be recorded separately before claiming a full AI result.

## Post-change local fallback check

The same seven photos were recognized with actual Tesseract and passed through the updated label fallback. This is a local fallback measurement, not a full NVIDIA OCR and LLM accuracy measurement.

| Focus field      | Before: exact matches | After: exact matches | After: wrong autofills | After: omissions |
| ---------------- | --------------------- | -------------------- | ---------------------- | ---------------- |
| Brand            | 5/7                   | 5/7                  | 0                      | 2                |
| Final amount     | 0/7                   | 3/7                  | 0                      | 4                |
| Purchase date    | 5/7                   | 7/7                  | 0                      | 0                |
| All three fields | 10/21                 | 15/21                | 0                      | 6                |

The Ovaltine receipt's final 20,000 amount is recovered. Both French receipts now recover their amounts and readable dates. Five deliberately blurred dates remain empty. The five correct brand results are correct empty results; neither positive brand example was recovered by this local fallback. Four totals also remain omitted because the recognized text is insufficient for a safe value. These omissions remain visible and editable in the existing review screen.

## Live post-change checks

The authenticated production app was checked in Chrome using unfinished drafts, without saving public test receipts to the vault:

- A fresh `cord-validation-002` upload recovered **20,000.00**, replacing the baseline's incorrect 100,000 cash value. The displayed OCR now keeps `Total: 20,000`, `Cash: 100,000` and `CHANGE: 80,000` on their own rows. The product text remains damaged (`1 S-0valt`), so Brand stays empty; its deliberately blurred date also stays empty. No printed currency was recovered, so the form's INR default still requires correction to IDR.
- Retrying the older upload against its cached, misaligned OCR rejected the incorrect 100,000 value and left Amount empty. This is a safety check against old OCR, not a fresh recognition measurement.
- Retrying `google-receipt` recovered **12.50** and **2021-07-25**. This also exposed a missing-model-currency case reverting to INR. Extraction version 5 now recovers a unique explicit printed currency, with regressions for EUR, unsupported defaults, bare dollar signs and conflicting currencies. The final live retry confirmed **EUR 12.50**, **2021-07-25** and an empty Brand without manually editing those fields.
- A fresh `cord-validation-005` upload recognized the faint brand as `LE HINERAL`. Brand remained empty. Its ambiguous `8.000` amount also stayed empty, without inventing a currency or decimal convention.

The live UI does not independently establish the provider for every stage. These observations verify the app's image-to-form behavior, not raw NVIDIA response geometry or a comprehensive provider benchmark. Faint-brand recognition remains unresolved; no spelling substitution or brand lookup was added that could invent a maker.

The existing Retry reading control now runs the available reader directly when hosted background jobs are unavailable. It preserves manual edits, flushes pending autosaves before reading and keeps the existing model-call budget. New uploads require no additional steps.

Validation: 409 unit tests across 25 files, typecheck and changed-file lint passed. Desktop/mobile browser coverage includes four retry and autosave regressions. Production PWA checks passed. Windows production builds and packaged PDF/native-canvas/Tesseract verification passed; the Vercel preset also generated its deployment output successfully. The checkout's existing CRLF-only lint failures were checked separately with an end-of-line override, without reformatting the repository.

## Reproducing the evaluation

Create a private manifest using the format accepted by `scripts/evaluate-extraction.mjs`: a `cases` array with an ID, a relative `file` path and an `expected` object. Use the app's field names `brand`, `purchasePrice`, `currency` and `purchaseDate`; prices are decimal strings and unknown fields are `null`. Keep originals and this private manifest outside Git. Downloaded source annotations must never be substituted for OCR text when measuring the image pipeline.

```sh
npm run eval:extraction -- --manifest /private/receipts.json --ocr-provider auto --output /private/safe-report.json
```

`auto` uses the production image preparation and NVIDIA OCR response reader, preserving reconstructed rows and columns, then falls back to Tesseract if NVIDIA OCR is unavailable or fails. Explicit `nvidia` fails instead of silently substituting local OCR; explicit `tesseract` supports a separate fallback comparison. PDF text extraction follows the existing production path.

Reports show per-field matches, wrong populated values, omissions, OCR sources, fallback counts and model-call counts. They exclude receipt text, expected values, predictions, evidence quotes, source file paths and credentials. The LLM key is required; label fallback is reported and never counts as a passing AI case. Each extraction retains the existing two-request maximum. Optional forced name-repair comparisons perform additional, separately counted benchmark calls and must not be described as the normal app request count.

## Limits

The corpus has two positive brand examples, two readable dates and five deliberately unreadable dates. It covers Indonesian and French receipts, with no representative Indian electronics/warranty corpus or newly captured user phone photos. It therefore tests important failures—cash versus total, separators, receipt dates and absent brands—without proving robust logo recognition or broad brand coverage. Printed brand spelling is preserved; missing or unreadable brand information must remain empty. No extra upload, confirmation or review step is required by the evaluator or the extraction changes.

The live checks above and local fallback measurements are distinct. The remaining brand, currency and amount omissions must not be represented as fixed, and the selected corpus does not establish full-provider accuracy.
