# Payments — Paystack + manual, switchable by admin

**Stop and ask the owner before going live with anything in §6 (pooled contributions).** It involves holding other people's money.

## 1. Principles
- Integers only: Naira in **kobo**, coins as whole numbers. One conversion rule from `settings.coin_rate_kobo_per_coin`.
- Every change to anyone's balance is an append-only row in `wallet_ledger` written **inside one DB transaction** together with the thing it pays for. No balance column is ever edited directly.
- The server decides prices and totals. The browser never sends a price. A "payment succeeded" message from the browser is meaningless.
- Idempotency: every payment has a unique `reference`. Settling the same reference twice must do nothing the second time.
- Log every webhook, approval and refund (who, when, before/after).

## 2. Mode switch
`settings.payment_mode`: `"paystack"` | `"manual"` | `"both"` (superadmin only, audited). `POST /payments/initiate` reads it on every call:
- `paystack` → Paystack checkout only.
- `manual` → bank-transfer flow only.
- `both` → the buyer chooses; the request must say which.
Switching mode never touches payments already in progress; each payment keeps the provider it started with.

## 3. What can be paid for
| Purpose | Result when payment succeeds |
|---|---|
| `coin_topup` | credit `amount_kobo / rate` coins to the wallet (`type=topup`) |
| `order` (real product, optional in-site payment) | order status `paid` (`type` ledger entry for NGN receipts); seller notified; WhatsApp flow remains available |
| `contribution` | confirms the contribution (§6) |
Buying virtual items (clothes, hair, bags, cars, houses) is **coin → item** and needs no external payment at purchase time (`POST /store/purchase`, ledger debit + inventory insert in one transaction).

## 4. Paystack flow
1. `POST /payments/initiate` → create `payments` row (`status=initiated`, unique `reference`), call Paystack *Initialize Transaction* from the server (amount in kobo, buyer email, `reference`, callback URL). Return `authorization_url`.
2. Browser goes to Paystack, pays, returns to the callback page. The callback page calls `GET /payments/verify/{reference}`; the server calls Paystack *Verify Transaction* and checks: `status=="success"`, `amount == payments.amount_kobo`, `currency == NGN`, reference matches. Only then settle.
3. **Webhook** `POST /webhooks/paystack` is the source of truth. Verify the `x-paystack-signature` header = HMAC-SHA512 of the **raw** request body with the secret key; reject otherwise. Handle `charge.success`; ignore unknown events with HTTP 200. Settle exactly like step 2. Respond 200 quickly.
4. Settlement = one transaction: lock the payment row, if not already `succeeded` set it, write ledger/purpose effects, commit.
5. Expire `initiated` payments after 24 h (`expired`). A late success webhook for an expired payment is still settled (money arrived) and flagged for review.
Use test keys in development. Keys live in server config only. Keep the callback and webhook URLs on HTTPS.

## 5. Manual flow
1. `POST /payments/initiate` → create payment (`provider=manual`, `status=initiated`) → return bank details from `settings.manual_bank_details` plus a unique reference to put in the transfer narration.
2. Buyer pays by transfer, then uploads proof (`POST /payments/{reference}/proof`: screenshot + note) → `status=pending_review`.
3. Admin (role `finance`) opens the pending list, compares the proof with the bank statement, then **approve** (settle exactly like step 4 above) or **reject** (with a reason shown to the buyer). Approver ≠ requester when the requester is staff.
4. Proofs are stored privately (not publicly listable), shown only to the buyer and finance/superadmin.

## 6. Group contributions (crowdfunding) — rules  
> **DEFERRED:** not part of the current build. Do not create the tables, routes or UI until the owner asks. Kept here so the design is not lost.
- A goal has `goal_kobo`, `deadline`, a target (product or catalog item) and a creator.
- Each contribution is its own payment (Paystack or manual). Only `confirmed` contributions count toward `raised_kobo`.
- **Funded:** when confirmed contributions ≥ goal, status `funded`. The platform then completes the purchase: for a real product → creates the order and notifies the seller (payout to seller follows the site's existing seller-payout process); for a catalog item → adds it to the creator's inventory.
- **Failed/expired/cancelled:** every confirmed contribution is refunded. Paystack payments: refund through Paystack's refund API; manual payments: refund by transfer recorded by finance (`payments.status=refunded`, ledger row, note). Refunds are never silent: each shows in the contributor's wallet history.
- Over-funding: cap contributions at the remaining amount.
- Fees: define in `settings` (default 0) and show before paying. Do not invent fees.
- Disputes: admin can freeze a crowdfund. All steps are audited.
- **Legal/compliance:** pooling money for someone else's purchase may fall under financial-services or consumer-protection rules in Nigeria and under Paystack's terms. The owner must review this with a lawyer and with Paystack before enabling `crowdfund_enabled`. Ship the feature behind that setting, off by default, with clear terms shown before the first contribution.

## 7. Wallet rules
- Coins cannot be withdrawn to cash in v1. Coins are non-transferable between players in v1 (gifting items may come later).
- NGN balance (if used at all) is only a record of receipts/refunds; no stored-value NGN wallet in v1 unless the owner decides otherwise.
- A purchase fails with `insufficient_funds` rather than going negative; check balance and write the debit in the same locked transaction.

## 8. Test checklist (must pass before each go-live)
- Paystack test mode: success, abandoned, failed card, duplicate webhook, webhook before callback, callback before webhook, wrong amount, forged signature.
- Manual: approve, reject, double-approve (second does nothing), approve after expiry.
- Ledger: sum of a user's ledger rows equals their balance after every scenario; concurrent purchases cannot overspend.
- Refund of a contribution restores the contributor's records and never double-refunds.
- Mode switch while a payment is in progress does not break it.
