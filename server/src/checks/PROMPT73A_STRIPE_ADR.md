# ADR 73A: Standard Connect and direct subscription charges

17 October 2026. Status: **proposed for business, Stripe, legal and tax approval**.
Architecture preserved from Prompt 73. No live activation or alternative model implemented.

## Decision and evidence

Keep Plus on the platform and paid-Hive customers/subscriptions/charges on each
owner's Standard connected account, with `application_fee_percent: 10`.
Owners provide the ongoing benefits and have Stripe Dashboard access to manage
their business, refunds and dispute evidence. Separate account contexts reduce
accidental commingling of owner payments with platform Plus subscriptions.
These are reasons for the proposal, not a legal merchant-of-record determination.

| Question | Stripe/product facts | Proposed policy and approval boundary |
| --- | --- | --- |
| Charge location | Direct charges and their payment objects belong to the connected account; retrieve them with that account context. | Retain the implemented separation; approve operating entity and member-facing merchant identity. |
| Why Standard | Stripe-hosted onboarding and a full Stripe Dashboard fit independent owners handling their own refunds. | Confirm platform control is sufficient for moderation, incidents and consumer escalation. |
| Platform income | The subscription specifies a 10% application fee. Stripe creates a platform application-fee object. Fee creation can be asynchronous. | Approve 10% and which refunds return that fee. Never present the estimate as a guaranteed payout. |
| Processing and other costs | Direct-charge processing costs normally debit the connected account. Actual controller, pricing agreement, country, method, Billing and Connect charges matter. | Recommend owner pays costs charged to their account, disclosed before publication. Finance must verify the actual agreements and test invoice/balance records. No universal fixed processing rate is assumed. |
| Member refunds | Direct-charge refunds debit the connected balance. Owners can initiate refunds in Stripe. | Owner handles paid-Hive requests; TrueHive provides recorded requests, reports and escalation. Statutory rights and Stripe obligations remain. Plus refunds require a separate platform support procedure. |
| Application-fee refunds | Refunding the charge does not automatically promise return of the platform fee. Platform fee refunds are separate operations. | Recommend proportional fee return for approved service-failure refunds, subject to finance/counsel approval; alternatives are retaining the fee or refunding it fully. Existing code does not move refund money. |
| Disputes/losses | Chargebacks debit the direct-charge account. Ultimate loss responsibility depends on controller settings and agreements. Direct charges do not establish that TrueHive has no liability. | Owner supplies evidence; platform monitors/escalates. Record `controller.losses.payments`, fee payer, requirements collector and actual contract terms before approval. |
| Payouts | Balances and payouts are account-wide, including unrelated Standard account activity. | Display actual balances/payouts separately from per-Hive gross, refunded amounts and fees. Reconcile invoice → charge → balance transaction → application fee → payout; never infer bank settlement from gross revenue. |
| Geography | Account capabilities and supported countries/payment methods vary. USD pricing alone does not restrict seller/customer geography. | Recommend an explicitly approved US-only pilot first. This is NOT currently an enforced country allowlist. Broader availability requires review and a tested eligibility gate. |
| Taxes/reporting | Charge model alone does not settle seller/platform sales-tax, marketplace-facilitator, VAT or information-reporting obligations. | Tax professional assigns registration, collection, invoices and reporting by jurisdiction. No Stripe Tax implementation or tax exemption is claimed. |

Sources checked 17 October 2026: [direct charges](https://docs.stripe.com/connect/direct-charges.md?platform=web&ui=stripe-hosted),
[subscriptions](https://docs.stripe.com/connect/subscriptions),
[Standard accounts](https://docs.stripe.com/connect/standard-accounts),
[Connect pricing](https://stripe.com/connect/pricing),
[direct-charge operational risks](https://support.stripe.com/questions/what-should-i-know-about-using-direct-charges?locale=en-GB),
[application-fee object](https://docs.stripe.com/api/application_fees/object).
Actual account configuration and agreements have **not** been inspected: credentials absent.

## Alternatives

Destination charges put the payment on the platform and transfer proceeds. This
offers centralized payment control but places fees/refunds/disputes on the
platform balance and requires transfer/application-fee reversal policies.
Separate charges/transfers permit delayed or multi-party allocation, with more
reconciliation, recovery and settlement responsibilities. Neither is clearly
safer without approved merchant roles, loss allocation and operating procedures.
Do not switch architectures to resolve a disclosure or account-access problem.

## API contract and risks

Official `stripe` 23.x remains installed; all requests explicitly pin
`2025-02-24.acacia`. The reconciliation depends on invoice `charge`,
`paid_out_of_band`, top-level subscription linkage and subscription period fields.
Stripe's [invoice breaking change](https://docs.stripe.com/changelog/basil/2025-03-31/add-support-for-multiple-partial-payments-on-invoices)
and [subscription-period change](https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-subscription-current-period-start-and-end)
explain why silently adopting Basil or later is unsafe. SDK package version does
not prove the historical wire contract. Both destinations must emit Acacia
snapshot events. Real response expansion/fee compatibility remains blocked.

Durable reservations, unique bindings, verified invoices and paid-through access
remain required. Signature checks authenticate events but do not replace object
retrieval, account/customer binding and product validation. Dashboard edits can
break the approved contract; fail closed and investigate rather than granting
access. Cancellation intent is durable before Stripe calls; leases permit another
worker to recover after a crash. Network outages can delay actual cancellation
and need an owner/member remediation procedure.

Unknown processing/application fees remain unknown. Platform application-fee
creation/refund events now retrieve current fees and update their account/charge-
bound invoice, including historical invoices after later renewals. Duplicate,
out-of-order and early-delivery retry behavior passed eight synthetic-Stripe
checks on actual PostgreSQL. Register these additional platform events:
`application_fee.created`, `application_fee.refunded`,
`application_fee.refund.updated`. This does not prove actual wire compatibility or
replace accounting exports/reconciliation of missed historical events. Actual
fees, refunds, disputes, deauthorization and balances must be reconciled against
real sandbox objects before staging approval.
