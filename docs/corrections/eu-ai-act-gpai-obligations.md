# EU AI Act Obligations for General-Purpose AI Model Providers

## Summary
The EU Artificial Intelligence Act (Regulation (EU) 2024/1689) sets binding obligations for providers of general-purpose AI (GPAI) models, with extra duties for models that carry "systemic risk". The GPAI rules have applied since 2 August 2025. Models already on the market before that date have until 2 August 2027 to comply, and the Commission's power to fine GPAI providers starts on 2 August 2026. Supervision sits with the European AI Office inside the Commission [1][2].

## Key facts
* **Dates:** the Act entered into force on **1 August 2024**. GPAI obligations apply from **2 August 2025** (Art. 113(b)). GPAI models placed on the market **before 2 August 2025** must comply by **2 August 2027** (Art. 111(3)). Fines for GPAI providers can be imposed from **2 August 2026** [1].
* **Systemic-risk threshold:** a GPAI model is presumed to have high-impact capabilities (systemic risk) when the cumulative compute used to train it is **greater than 10^25 FLOPs** (Art. 51(2)). The Commission can also designate a model as having systemic risk (Art. 51(1)(b)) and can update the threshold by delegated act (Art. 51(3)) [1].
* **Notification:** a provider must notify the Commission **within two weeks** of its model meeting (or it becoming known that it will meet) the threshold (Art. 52(1)) [1].
* **Open-source models:** models released under a free and open-source licence, with weights and architecture made public, are exempt only from the **technical documentation and downstream information** duties (Art. 53(1)(a)-(b)) and from appointing an authorised representative (Art. 54). They must **still** have a copyright policy and publish a training-content summary, and there is **no exemption** for models with systemic risk (Art. 53(2), 54(6)) [1].
* **Fines:** the Commission can fine GPAI providers **up to €15 million or 3% of total worldwide annual turnover**, whichever is higher (Art. 101). The €35 million / 7% tier applies to *prohibited AI practices* (Art. 99(3)), not to GPAI obligations [1].
* **Regulator:** the **European AI Office**, established within the Commission by **Commission Decision C(2024) 390 of 24 January 2024**, supervises and enforces the GPAI rules [2].

## Core obligations for all GPAI providers (Art. 53)
* **Technical documentation (Art. 53(1)(a), Annex XI):** draw up and keep up to date technical documentation of the model, including its training and testing process and evaluation results, and provide it to the AI Office and national competent authorities on request [1].
* **Downstream information (Art. 53(1)(b), Annex XII):** give providers who integrate the model into their own AI systems the information and documentation they need to understand its capabilities and limitations and meet their own obligations [1].
* **Copyright policy (Art. 53(1)(c)):** put in place a policy to comply with Union copyright law, in particular to identify and respect rights reservations expressed under Article 4(3) of the DSM Directive (EU) 2019/790 (text-and-data-mining opt-outs) [1].
* **Training-content summary (Art. 53(1)(d)):** draw up and publish a sufficiently detailed summary of the content used for training, using the template provided by the AI Office (published July 2025) [1][4].
* **Authorised representative (Art. 54):** providers established outside the EU must appoint an authorised representative in the Union before placing a model on the EU market [1].

## Additional obligations for GPAI models with systemic risk (Art. 55)
* **Model evaluation:** perform evaluations with standardised, state-of-the-art protocols and tools, including adversarial testing (red-teaming), to identify and mitigate systemic risks (Art. 55(1)(a)) [1].
* **Risk assessment and mitigation:** assess and mitigate possible systemic risks at Union level, including their sources (Art. 55(1)(b)) [1].
* **Serious incidents:** track, document and report serious incidents and possible corrective measures to the AI Office and, as appropriate, national competent authorities without undue delay (Art. 55(1)(c)) [1].
* **Cybersecurity:** ensure an adequate level of cybersecurity protection for the model and its physical infrastructure (Art. 55(1)(d)) [1].

## Codes of practice and how compliance is shown
* Providers can rely on **codes of practice** (Art. 56) to demonstrate compliance with Arts. 53 and 55 until harmonised standards are published (Art. 53(4), 55(2)) [1].
* The **General-Purpose AI Code of Practice** was published in July 2025, with chapters on transparency, copyright, and safety and security; the Commission also published guidelines clarifying who counts as a GPAI provider [3][4].
* Providers that do not follow an approved code must show compliance by other adequate means, to be assessed by the Commission (Art. 53(4), 55(2)) [1].

## Enforcement timeline
* **2 August 2025:** GPAI obligations apply to models placed on the market from this date [1].
* **2 August 2026:** the Commission's enforcement powers, including fines under Art. 101, become applicable [1].
* **2 August 2027:** deadline for GPAI models placed on the market before 2 August 2025 (Art. 111(3)) [1].
* The **Scientific Panel** of independent experts (Art. 68) supports the AI Office and can issue qualified alerts about systemic risks (Art. 90) [1].

## Trade-offs and strategic challenges
* **Transparency vs trade secrets:** technical documentation and training-content summaries create tension with proprietary methods; the Act requires confidentiality for information obtained by authorities (Art. 78), but commercial sensitivity remains.
* **Compute threshold:** a single training-compute threshold is simple to apply but can miss capable models trained below it through algorithmic efficiency; the Commission can adjust it by delegated act (Art. 51(3)).
* **Open source:** the open-source exemption is narrow and disappears for models with systemic risk, which matters for open-weight models trained at large scale.

## Open questions
* How will the AI Office check copyright policies and training summaries in practice without exposing trade secrets?
* Will the 10^25 FLOPs threshold be revised, and how quickly, as training efficiency improves?
* How will the Commission enforce obligations and fines against providers outside the EU?

## Corrections
Revised on 25 October 2026 after review by a buyer agent:
* **Fines:** corrected to €15 million or 3% of worldwide turnover (Art. 101). An earlier version wrongly gave the €35 million / 7% tier, which applies to prohibited practices (Art. 99(3)).
* **AI Office:** corrected to Commission Decision C(2024) 390 of 24 January 2024 (was "30 May 2024").
* **Open-source exemption:** narrowed to Art. 53(1)(a)-(b) and Art. 54; copyright policy and training summary still apply.
* **Dates:** removed the incorrect claim that deadlines culminate in mid-2026 for existing models, and the "significant modification" caveat on the 2027 deadline (that rule is for high-risk systems).
* **Added:** the two-week notification duty (Art. 52(1)), Commission designation (Art. 51(1)(b)) and the authorised-representative duty (Art. 54).

## Sources
1. Regulation (EU) 2024/1689 of the European Parliament and of the Council of 13 June 2024 (Artificial Intelligence Act), OJ L, 12.7.2024 — eur-lex.europa.eu
2. Commission Decision C(2024) 390 of 24 January 2024 establishing the European Artificial Intelligence Office
3. European Commission, General-Purpose AI Code of Practice (July 2025) — digital-strategy.ec.europa.eu
4. European Commission, Guidelines on the scope of obligations for providers of general-purpose AI models, and template for the public summary of training content (July 2025)
