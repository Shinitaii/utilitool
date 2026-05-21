# Payment Audit Trail Design

**Date**: 2026-05-21  
**Status**: Design approved, pending QA review  
**Scope**: Payment proof tracking, auto-status updates, audit compliance  

---

## Problem Statement

Currently, when a billing is marked as "paid," there is no audit trail. The system lacks:
- Who marked it paid and when
- What proof was provided (reference number, receipt, etc.)
- Whether the payment was auto-detected or manually entered
- Compliance-ready audit logs for landlord/tenant disputes

Additionally, the system needs to support:
1. **Static QR codes** (current): tenant scans, pays, provides reference number manually
2. **Future merchant API integration** (when tenant UI is built): auto-capture of transaction IDs and proof
3. **Auto-flip payment status** when valid proof is submitted

---

## Design Decision: Separate PaymentProof Collection

**Rationale**:
- Full payment only (no partial payments) means each billing has **at most 1 proof**
- Separate collection allows direct audit queries: `SELECT * FROM payment_proofs WHERE marked_at BETWEEN X AND Y`
- Keeps Billing document lightweight
- Natural fit for upcoming audit logging system
- Supports both static QR and future merchant API without redesign

---

## Data Model

### PaymentProof

**Location**: `src/features/payment-proof/payment-proof.model.ts`

```ts
export interface PaymentProof extends BaseModel {
  billing_id: string;                           // Links to the billing being paid
  proof_type: 'static_qr' | 'merchant_api';    // How payment was made
  reference_number: string;                     // Bank ref, merchant txn ID, manual entry
  proof_url?: string;                          // Receipt photo URL (optional)
  marked_by: string;                           // User ID who recorded proof
  marked_at: Date;                             // Timestamp of proof submission
  auto_detected: boolean;                      // true if system auto-detected from merchant API
}
```

**Firestore Collection**: `payment_proofs`

**Indexes**:
- `billing_id` (for looking up proof by billing)
- `marked_at` (for audit range queries)
- `proof_type` (for filtering static vs merchant)

### Billing (Updated)

**Location**: `src/features/billing/billing.model.ts`

```ts
export interface Billing extends BaseModel {
  property_id: string;
  previous_reading_id: string;
  current_reading_id: string;
  payment_status: 'pending' | 'paid';
  paid_at?: string;                            // Timestamp when marked paid (from proof)
  proof_id?: string;                           // Reference to PaymentProof document
}
```

**Changes**:
- `paid_at` now populated by payment proof submission
- New optional `proof_id` to cross-reference the proof document

---

## Payment Status Auto-Flip Logic

### Trigger
When `POST /payment-proofs` is called with valid data:

```json
{
  "billing_id": "billing_123",
  "reference_number": "TRF-2026-05-21-00123",
  "proof_type": "static_qr",
  "marked_by": "admin_456",
  "proof_url": "https://storage.example.com/receipt.jpg"
}
```

### Atomic Transaction
1. Validate PaymentProof data (reference format, proof_url accessibility, etc.)
2. Validate billing exists and is currently `pending`
3. Create PaymentProof document in Firestore
4. Update linked Billing: `payment_status = 'paid'`, `paid_at = now()`, `proof_id = proof.id`
5. All-or-nothing: if any step fails, transaction rolls back

### Validation Rules
- **Reference number**: Required, alphanumeric + hyphens, 1–100 chars
- **proof_url**: Optional, must be valid HTTPS URL
- **billing_id**: Must exist and be `payment_status = 'pending'`
- **Duplicate prevention**: If a billing already has a `proof_id`, reject with 409 Conflict

### Response
On success: Updated Billing document with `payment_status = 'paid'`  
On failure: 400/409 with error details for UI to display to admin

---

## Workflow: Static QR (Current)

**For now**, with no tenant-facing payment form:

1. **Setup** (admin portal):
   - Generate QR code that encodes: `billing_id`, `amount`, property info
   - Display on invoice or send to tenant
   - QR points to payment form with pre-filled billing ID + amount (admin-only for now)

2. **Tenant pays**:
   - Scans QR → payment form shows: "Pay $X for [Property] [Billing Cycle]"
   - Tenant clicks "Approve" → redirects to bank app or payment gateway
   - Bank processes payment, issues reference number (e.g., TRF-2026-05-21-00123)

3. **Proof submission**:
   - Tenant receives reference number or admin sees it in bank statement
   - Admin logs into portal → finds billing → clicks "Mark Paid"
   - Form shows: Reference Number field + optional Receipt Upload
   - Admin enters reference number + uploads receipt (optional)
   - Clicks submit → `POST /payment-proofs`

4. **Auto-flip**:
   - System validates reference number format + proof_url
   - Creates PaymentProof
   - Automatically updates billing to `paid`

---

## Workflow: Future Merchant API Integration

**When tenant-facing payment UI is built**:

1. **Payment flow**:
   - Tenant views billing → clicks "Pay Now"
   - Redirected to merchant gateway (Stripe, 2Checkout, Xendit, etc.)
   - Gateway shows exact amount owed
   - Tenant completes payment
   - Gateway returns transaction ID (e.g., `stripe_pi_123456`)

2. **Backend handling**:
   - After payment success, backend creates PaymentProof:
     ```ts
     {
       billing_id: billing.id,
       proof_type: 'merchant_api',
       reference_number: gateway_txn_id,
       marked_by: 'system',
       auto_detected: true,  // Machine-generated, no manual approval needed
       marked_at: now()
     }
     ```
   - Transaction auto-flips billing to paid
   - System stores receipt URL from merchant API (optional)

3. **Webhook (optional)**:
   - Merchant gateway sends confirmation webhook with receipt data
   - Backend verifies webhook signature + amount matches billing
   - Updates proof_url if receipt available

**No redesign needed** — same PaymentProof schema, just different `proof_type` and `auto_detected` flag.

---

## Audit Trail Integration

### Direct Queryability
The separate `payment_proofs` collection is directly queryable for compliance:

```
Example queries:
- "All payments for property X in May 2026"
  → Query billings by property_id, then join proofs by billing_id
  
- "All manually-entered proofs (not auto-detected)"
  → Query payment_proofs WHERE auto_detected = false AND marked_at BETWEEN X AND Y
  
- "Who approved payment for billing Y?"
  → Query payment_proofs WHERE billing_id = 'Y', get marked_by + marked_at

- "Show payment history by admin"
  → Query payment_proofs WHERE marked_by = 'admin_123' ORDER BY marked_at DESC
```

### Integration with Upcoming Audit Logging System
When you build broader audit logging:
- PaymentProof can feed into an `audit_events` collection or append-log
- Each proof becomes an audit event: `{ event_type: 'payment_proof_created', proof_id, billing_id, marked_by, marked_at, ... }`
- Existing proof structure maps cleanly to audit schema

---

## Error Handling & Edge Cases

| Scenario | Status Code | Behavior |
|----------|-------------|----------|
| Proof submitted for already-paid billing | 409 Conflict | Reject; return message "Billing already marked paid" + existing proof_id |
| Invalid reference number format | 400 Bad Request | Reject with validation error |
| proof_url not accessible | 400 Bad Request | Reject; admin can retry with corrected URL |
| Billing does not exist | 404 Not Found | Reject; check billing_id spelling |
| Duplicate reference number for same billing | 409 Conflict | Reject; prevent duplicate proofs |
| Tenant disputes payment; admin needs to unpay | N/A (design phase) | Soft-delete proof, revert billing to `pending`, log action in audit trail |

---

## API Endpoints (New)

### Create Payment Proof
```
POST /payment-proofs
Content-Type: application/json

{
  "billing_id": "billing_123",
  "reference_number": "TRF-2026-05-21-00123",
  "proof_type": "static_qr",
  "marked_by": "admin_456",
  "proof_url": "https://storage.example.com/receipt.jpg"  // optional
}

Response: 201 Created
{
  "id": "proof_456",
  "billing_id": "billing_123",
  "reference_number": "TRF-2026-05-21-00123",
  "proof_type": "static_qr",
  "marked_by": "admin_456",
  "marked_at": "2026-05-21T10:30:00Z",
  "auto_detected": false,
  "created_at": "2026-05-21T10:30:00Z",
  "updated_at": "2026-05-21T10:30:00Z"
}
```

### Get Payment Proof by ID
```
GET /payment-proofs/:id
Response: 200 OK + PaymentProof document
```

### List Payment Proofs (Filtered)
```
GET /payment-proofs?billing_id=billing_123&marked_at_from=2026-05-01&marked_at_to=2026-05-31
Response: 200 OK + PaginatedResult<PaymentProof>
```

### Get Proof for a Billing
```
GET /billings/:id/payment-proof
Response: 200 OK + PaymentProof (or 404 if not yet paid)
```

---

## Implementation Phases

### Phase 1: PaymentProof Collection + Static QR (MVP)
- New `payment-proof` feature folder with model, DTO, service, controller, routes
- `POST /payment-proofs` endpoint (manual proof entry)
- Update Billing model to add `proof_id` + `paid_at`
- Auto-flip logic: billing updates atomically on valid proof
- UI: "Mark Paid" form in billing detail (admin only)

### Phase 2: Audit Queries
- Add indexes for `marked_at` + `billing_id`
- Build audit report page: filter by property/date range, show all proofs
- Integrate with upcoming audit logging system

### Phase 3: Merchant API Integration (Later, when tenant UI exists)
- Update `proof_type` enum to include merchant_api
- Backend webhook handler for merchant confirmation
- Auto-create proof on webhook receipt
- UI: "Pay Now" button for tenants (in tenant-facing portal)

---

## Questions / Open Items

None at this stage. Design is complete and approved. Ready for implementation planning.

---

## References

- Original gap: "No audit trail when marking paid"
- Business requirement: Full payment only (no partial payments)
- Future: Broader audit logging system
- Related: QR code generation (handled separately in billing feature)
