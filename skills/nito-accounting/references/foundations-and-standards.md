# Foundations and Indonesian standards

> Part of the `nito-accounting` skill. Text is taken from the research report dated 16 November 2026 (`research/erp-accounting-implementation-guide.md` in this repo). Every claim keeps its evidence label; see `evidence-labels.md`. Worked entries are constructed illustrations: amounts invented, rules sourced. Rates, caps and deadlines live in `values-to-verify.md` and must be re-checked before use.

## Foundations and the rules the ledger must enforce

The ledger rests on the accounting equation and on the Conceptual Framework's five elements. An asset is "a present economic resource controlled by the entity as a result of past events", a liability is "a present obligation of the entity to transfer an economic resource", equity is the residual, and income and expenses are changes in assets and liabilities that change equity other than through owner contributions and distributions (CF 4.3, 4.26, 4.63, 4.68, 4.69; STANDARD, [Framework copy](https://moodle2.units.it/pluginfile.php/493397/mod_resource/content/1/conceptual-framework-for-financial-reporting.pdf)). Financial statements are prepared on the accrual basis except for cash-flow information, on a going-concern assumption assessed over at least twelve months, without offsetting unless a standard permits (IAS 1.25-27, 1.32; STANDARD, [IAS 1 copy](https://moodle2.units.it/pluginfile.php/493402/mod_resource/content/1/ias-1-presentation-of-financial-statements.pdf)). A journal is the book of original entry, each entry has at least one debit and one credit, and "the dollar value of the debits must equal the dollar value of the credits" ([OpenStax 3.5](https://openstax.org/books/principles-financial-accounting/pages/3-5-use-journal-entries-to-record-transactions-and-post-to-t-accounts), TEXTBOOK). A trial balance lists all non-zero ledger balances, the two columns must agree, and it catches only computational errors ([OpenStax 3.6](https://openstax.org/books/principles-financial-accounting/pages/3-6-prepare-a-trial-balance)). The notes did not open the textbook list of errors a trial balance cannot detect, so the statement that it cannot detect wrong-account or wrong-period postings is a design inference from "computational errors", not a sourced list.

| Account type (Indonesian) | Normal balance | Increases with | Statement |
|---|---|---|---|
| Asset (Aset) | Debit | Debit | Position |
| Liability (Liabilitas/Utang) | Credit | Credit | Position |
| Equity (Ekuitas) | Credit | Credit | Position |
| Revenue (Pendapatan) | Credit | Credit | Profit or loss |
| Expense (Beban) | Debit | Debit | Profit or loss |
| Contra asset (Akumulasi Penyusutan, Cadangan Kerugian) | Credit | Credit | Position |
| Dividends (Dividen, Prive) | Debit | Debit | Equity movement |

The table is a CONSTRUCTED summary of OpenStax 3.2 and 3.5. Its practical consequence is that "debit" is a position, not an increase: a debit to Utang Usaha reduces a liability, so a ledger that stores one signed amount must define the sign against the normal balance, or store separate debit and credit columns ([OpenStax 3.2](https://openstax.org/books/principles-financial-accounting/pages/3-2-define-and-describe-the-expanded-accounting-equation-and-its-relationship-to-analyzing-transactions)).


## Which Indonesian standard applies is a configuration fact, not a constant

IAI's DSAK approved the Kerangka Standar Pelaporan Keuangan Indonesia (KSPKI) on 12 December 2022, effective 1 January 2024. It defines four pillars: SAK Internasional, SAK Indonesia (now called SAK Umum), SAK for Entitas Privat (EP, effective 1 January 2025, replacing SAK ETAP) and SAK EMKM, with Sharia PSAK/ISAK layered on top where relevant. Entities with public accountability use Pillar 1 or 2, entities without it use Pillar 2 or 3, and a move to a lower-requirement pillar is not permitted ([IAI KSPKI deck, Nov 2023](https://web.iaiglobal.or.id/assets/files/file_berita/Materi%20Sosialisasi%20KSPKI%20dan%20Nomenklatur_Nov2023.pdf), GUIDANCE; the deck states it carries the speaker's personal views, not IAI's). SAK EP is an adoption of IFRS for SMEs (2015) with 35 chapters, and an entity with public accountability may use it only where the competent authority allows ([IAI SAK EP slides](https://web.iaiglobal.or.id/assets/files/file_berita/Materi%20Presentasi_Sosialisasi%20SAK%20Entitas%20Privat.pdf), GUIDANCE, discussion material). The SAK EMKM facts (approved 24 October 2016, effective 2018, minimum statements are position, income statement and notes) are SECONDARY search-result summaries only ([DDTC](https://news.ddtc.co.id/apa-itu-sak-emkm-33179)) and its primary text and size thresholds were not opened. The owner's group is probably Pillar 2 or 3, but that is a facts question (public accountability, prior framework, lender or regulator requirements), so the design inference is to make the framework a company setting and keep the ledger identical, since the differences are mostly measurement and disclosure.

PSAK/ISAK were renumbered effective 1 January 2024 with "no change in the content" ([IAI](https://web.iaiglobal.or.id/assets/files/file_publikasi/Perubahan_Penomoran_PSAK_ISAK_dalam_SAK_Indonesia.pdf)). The first digit is 1 for an IFRS-derived standard, 2 for an IAS-derived one, 3 for local, 4 for Sharia, and the last two digits are the IFRS/IAS number. Old numbers still appear in contracts, ERP screens and audit reports, so the skill should map both ways.

| Topic | Old PSAK | New PSAK | Counterpart |
|---|---|---|---|
| Presentation of financial statements | 1 | 201 | IAS 1 |
| Cash flows | 2 | 207 | IAS 7 |
| Inventories | 14 | 202 | IAS 2 |
| Property, plant and equipment | 16 | 216 | IAS 16 |
| Revenue from contracts with customers | 72 | 115 | IFRS 15 |
| Leases | 73 | 116 | IFRS 16 |
| Financial instruments | 71 | 109 | IFRS 9 |
| Employee benefits | 24 | 219 | IAS 19 |
| Income taxes | 46 | 212 | IAS 12 |
| Foreign exchange | 10 | 221 | IAS 21 |
| Provisions and contingencies | 57 | 237 | IAS 37 |
| Intangible assets | 19 | 238 | IAS 38 |
| Accounting policies, estimates, errors | 25 | 208 | IAS 8 |
| Impairment of assets | 48 | 236 | IAS 36 |
| Consolidated statements | 65 | 110 | IFRS 10 |

Source: [IAI comparison table](https://web.iaiglobal.or.id/assets/files/file_publikasi/Komparasi%20Perubahan%20Penomoran%20PSAK%20ISAK%20SAK%20Indonesia_FINAL.pdf) (GUIDANCE); the "Counterpart" column is derived from IAI's numbering rule, not printed in the table. IFRS 18 applies to annual periods beginning on or after 1 January 2027, replaces IAS 1 and requires operating and "profit before financing and income taxes" subtotals, with income and expenses classified as operating, investing, financing, income taxes or discontinued operations ([IFRS Foundation](https://www.ifrs.org/issued-standards/list-of-standards/ifrs-18-presentation-and-disclosure-in-financial-statements/); [2026 HTML](https://www.ifrs.org/content/dam/ifrs/publications/html-standards/english/2026/issued/ifrs18.html)). IAI approved PSAK 118 on 28 May 2025 with the same 1 January 2027 effective date ([IAI DSAK Terkini](https://web.iaiglobal.or.id/assets/files/file_sak/DSAK%20Terkini%20Volume%207%202025.pdf)); that PSAK 118 replaces PSAK 201 and had an exposure draft approved on 26 November 2024 comes only from a search snippet of IAI News and is UNVERIFIED. The design consequence, an inference from IFRS 18 and IAS 1.54/1.82, is that each ledger account needs attributes for statement, line, current/non-current, cash-flow class and, from 2027, the IFRS 18 category, otherwise statements need manual mapping.
